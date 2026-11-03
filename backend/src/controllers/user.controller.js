/**
 * User Controller
 * Handles profile management, video listing, user search, and follow/unfollow operations.
 */

const mongoose = require('mongoose');
const User = require('../models/User');
const Video = require('../models/Video');
const Follow = require('../models/Follow');
const FollowEvent = require('../models/FollowEvent');
const ProfileViewEvent = require('../models/ProfileViewEvent');
const redis = require('../config/redis');
const videoService = require('../services/video.service');
const notificationService = require('../services/notification.service');
const { success, error, paginated } = require('../utils/apiResponse');
const escapeRegex = require('../utils/escapeRegex');
const sharp = require('sharp');
const storageService = require('../services/storage.service');
const { updateProfileSchema, normalizeLinks } = require('../validators/user.validator');

// Số ngày phải chờ giữa 2 lần đổi username (giống TikTok: 30 ngày). 0 = không giới hạn.
const USERNAME_CHANGE_DAYS = Number(process.env.USERNAME_CHANGE_DAYS ?? 30);

/**
 * Frontend có chỗ gọi theo username (/users/:username), có chỗ theo _id
 * (/users/:id/videos) → nhận cả hai.
 */
const findUserByParam = (param, projection) => {
  const query = mongoose.Types.ObjectId.isValid(param) && String(param).length === 24
    ? { $or: [{ _id: param }, { username: param }] }
    : { username: param };
  const q = User.findOne(query);
  return projection ? q.select(projection) : q;
};

/**
 * GET /users/:username
 * Returns a user's public profile, including:
 *  - Total likes across all their videos (aggregated)
 *  - Video count (from the videoCount field on the User document)
 *  - Whether the requesting user follows them (isFollowing)
 */
exports.getProfile = async (req, res) => {
  try {
    const { username } = req.params;

    const user = await findUserByParam(username)
      .select('-googleId -lastLoginAt -usernameChangedAt')
      .lean();
    if (!user) return error(res, 'User not found', 404);
    // Email chỉ trả cho chính chủ, không lộ trên hồ sơ công khai
    const isOwner = req.user && String(req.user._id) === String(user._id);
    if (!isOwner) delete user.email;

    // Ghi lượt xem hồ sơ (không tính chủ tài khoản; mỗi người xem/IP tối đa 1 lần / 30 phút)
    if (!isOwner) {
      const who = req.user ? `u:${req.user._id}` : `ip:${req.ip}`;
      redis
        .set(`pv:${user._id}:${who}`, '1', 'EX', 1800, 'NX')
        .then((ok) => ok && ProfileViewEvent.create({ profileUserId: user._id, viewerId: req.user?._id || null }))
        .catch(() => {});
    }

    // Aggregate total likes across all user videos
    const likeAgg = await Video.aggregate([
      { $match: { userId: user._id, status: 'ready' } },
      { $group: { _id: null, totalLikes: { $sum: '$likeCount' } } },
    ]);
    const totalLikes = likeAgg.length > 0 ? likeAgg[0].totalLikes : 0;

    // Determine if the requesting user follows this profile
    let isFollowing = false;
    if (req.user) {
      const follow = await Follow.exists({
        followerId: req.user._id,
        followingId: user._id,
      });
      isFollowing = Boolean(follow);
    }

    return success(res, {
      ...user,
      totalLikes,
      videosCount: user.videoCount,
      isFollowing,
    });
  } catch (err) {
    console.error('[getProfile]', err);
    return error(res, 'Failed to fetch profile', 500);
  }
};

/**
 * PATCH /users/me
 * Updates the authenticated user's profile.
 * Only `bio` and `avatarUrl` are whitelisted to prevent mass-assignment.
 */
exports.updateProfile = async (req, res) => {
  const { value, error: vErr } = updateProfileSchema.validate(req.body || {}, {
    abortEarly: false,
    stripUnknown: false,
  });
  if (vErr) {
    return error(res, vErr.details[0].message, 400, vErr.details.map((d) => d.message));
  }

  const updates = {};
  if (value.displayName !== undefined) updates.displayName = value.displayName;
  if (value.bio !== undefined) updates.bio = value.bio;
  if (value.avatarUrl === null) updates.avatarUrl = null;

  // Liên kết ngoài: chấp nhận URL hoặc @tài_khoản, lưu dạng URL đầy đủ
  if (value.links) {
    const links = normalizeLinks(value.links); // ném 400 nếu sai
    for (const [k, v] of Object.entries(links)) updates[`links.${k}`] = v;
  }

  // Đổi username: kiểm tra trùng (không phân biệt hoa thường) + giới hạn tần suất
  if (value.username && value.username !== req.user.username) {
    const last = req.user.usernameChangedAt;
    if (USERNAME_CHANGE_DAYS > 0 && last) {
      const next = new Date(last.getTime() + USERNAME_CHANGE_DAYS * 86400000);
      if (next > new Date()) {
        return error(
          res,
          `Bạn chỉ được đổi username ${USERNAME_CHANGE_DAYS} ngày một lần. Lần tới: ${next.toLocaleDateString('vi-VN')}`,
          429
        );
      }
    }
    const taken = await User.findOne({ username: value.username, _id: { $ne: req.user._id } })
      .collation({ locale: 'en', strength: 2 })
      .select('_id')
      .lean();
    if (taken) return error(res, 'Username này đã có người dùng', 409);
    updates.username = value.username;
    updates.usernameChangedAt = new Date();
  }

  if (Object.keys(updates).length === 0) return success(res, req.user, 200, 'Không có thay đổi');

  try {
    const user = await User.findByIdAndUpdate(req.user._id, { $set: updates }, { new: true, runValidators: true });
    return success(res, user, 200, 'Đã cập nhật hồ sơ');
  } catch (err) {
    // Hai người đổi cùng username một lúc → unique index báo trùng
    if (err.code === 11000) return error(res, 'Username này đã có người dùng', 409);
    throw err;
  }
};

/**
 * POST /users/me/avatar  (multipart/form-data, trường "avatar")
 * Cắt vuông 512×512, nén WebP, lưu MinIO rồi cập nhật avatarUrl.
 */
exports.uploadAvatar = async (req, res) => {
  if (!req.file) return error(res, 'Chưa chọn ảnh (trường "avatar")', 400);

  let image;
  try {
    image = await sharp(req.file.buffer)
      .rotate() // xoay theo EXIF (ảnh chụp điện thoại)
      .resize(512, 512, { fit: 'cover', position: 'attention' })
      .webp({ quality: 85 })
      .toBuffer();
  } catch {
    return error(res, 'Không đọc được file ảnh. Hãy dùng JPG, PNG hoặc WebP', 400);
  }

  const avatarUrl = await storageService.uploadBuffer(
    `avatars/${req.user._id}/${Date.now()}.webp`,
    image,
    'image/webp',
    storageService.BUCKETS.THUMBNAILS,
    storageService.IMMUTABLE_CACHE
  );

  const oldUrl = req.user.avatarUrl;
  const user = await User.findByIdAndUpdate(req.user._id, { avatarUrl }, { new: true });

  // Xoá ảnh cũ nếu do hệ thống lưu (không chặn response)
  const oldKey = storageService.keyFromUrl(oldUrl, storageService.BUCKETS.THUMBNAILS);
  if (oldKey && oldKey.startsWith('avatars/')) {
    storageService.deleteFile(oldKey, storageService.BUCKETS.THUMBNAILS).catch(() => {});
  }

  return success(res, user, 200, 'Đã cập nhật ảnh đại diện');
};

/**
 * DELETE /users/me
 * Permanently deletes the authenticated user's account.
 */
exports.deleteAccount = async (req, res) => {
  try {
    await User.findByIdAndDelete(req.user._id);
    return success(res, null, 200, 'Account deleted');
  } catch (err) {
    console.error('[deleteAccount]', err);
    return error(res, 'Failed to delete account', 500);
  }
};

/**
 * GET /users/:username/videos
 * Returns a cursor-paginated list of public (status=ready) videos for a given user.
 * Delegates to videoService.getUserVideos for query logic.
 */
exports.getUserVideos = async (req, res) => {
  try {
    const { username } = req.params;
    // Kẹp trong [1, 50]: limit âm/0 không được làm lộ toàn bộ danh sách
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 50);
    const { cursor } = req.query;

    // Resolve username → _id so videoService can query by userId
    const user = await findUserByParam(username, '_id').lean();
    if (!user) return error(res, 'User not found', 404);

    if (cursor && !/^\d{1,6}$/.test(cursor) && !mongoose.Types.ObjectId.isValid(cursor)) {
      return error(res, 'Invalid cursor', 400);
    }

    // Service đã tự lấy limit+1 và tính nextCursor → chỉ cần truyền limit.
    // Truyền thêm id người xem để chủ kênh thấy cả video private của mình.
    const { videos, nextCursor } = await videoService.getUserVideos(
      user._id,
      cursor,
      limit,
      req.user?._id
    );

    return paginated(res, videos, { nextCursor, hasMore: Boolean(nextCursor), limit });
  } catch (err) {
    console.error('[getUserVideos]', err);
    return error(res, 'Failed to fetch videos', 500);
  }
};

/**
 * GET /users/search?q=
 * Case-insensitive regex search on username, returns at most 10 results.
 * Returns only non-sensitive fields.
 */
exports.searchUsers = async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.trim().length === 0) {
      return error(res, 'Query parameter q is required', 400);
    }

    const users = await User.find(
      { username: { $regex: escapeRegex(q.trim().slice(0, 50)), $options: 'i' }, bannedAt: null },
      'username displayName avatarUrl bio followerCount videoCount isVerified'
    )
      .limit(10)
      .lean();

    return success(res, users);
  } catch (err) {
    console.error('[searchUsers]', err);
    return error(res, 'Search failed', 500);
  }
};

/**
 * POST /users/:username/follow
 * Toggles follow state for the authenticated user toward the target user.
 *
 * - If already following → unfollow (delete Follow doc, decrement counts).
 * - If not following → follow (create Follow doc, increment counts, send notification).
 *
 * Self-following is rejected.
 */
exports.followUser = async (req, res) => {
  try {
    const { username } = req.params;

    const targetUser = await User.findOne({ username });
    if (!targetUser) return error(res, 'User not found', 404);

    // Prevent self-following
    if (targetUser._id.toString() === req.user._id.toString()) {
      return error(res, 'You cannot follow yourself', 400);
    }

    const existing = await Follow.findOne({
      followerId: req.user._id,
      followingId: targetUser._id,
    });

    if (existing) {
      // --- UNFOLLOW ---
      // deleteOne trả về deletedCount: 2 request bỏ theo dõi cùng lúc thì chỉ
      // request thực sự xoá được bản ghi mới được giảm bộ đếm (tránh đếm âm).
      const { deletedCount } = await Follow.deleteOne({ _id: existing._id });
      if (!deletedCount) return success(res, { following: false }, 200, `Unfollowed @${username}`);
      FollowEvent.create({ followerId: req.user._id, followingId: targetUser._id, action: 'unfollow' }).catch(() => {});

      // Không chặn "> 0" ở đây: mỗi lần xoá thành công luôn ứng với 1 lần tạo thành công (+1),
      // nên +1/−1 luôn triệt tiêu đúng. Nếu chặn, khi lệnh −1 chạy trước lệnh +1 của request
      // theo dõi đang song song thì −1 bị bỏ qua và bộ đếm lệch vĩnh viễn.
      await User.updateOne({ _id: req.user._id }, { $inc: { followingCount: -1 } });
      await User.updateOne({ _id: targetUser._id }, { $inc: { followerCount: -1 } });

      return success(res, { following: false }, 200, `Unfollowed @${username}`);
    }

    // --- FOLLOW ---
    await Follow.create({
      followerId: req.user._id,
      followingId: targetUser._id,
    });
    FollowEvent.create({ followerId: req.user._id, followingId: targetUser._id, action: 'follow' }).catch(() => {});

    await User.findByIdAndUpdate(req.user._id, { $inc: { followingCount: 1 } });
    await User.findByIdAndUpdate(targetUser._id, { $inc: { followerCount: 1 } });

    // Notify the followed user
    await notificationService.createNotification(targetUser._id, 'new_follower', {
      actorId: req.user._id,
      actorUsername: req.user.username,
      actorAvatar: req.user.avatarUrl,
    });

    return success(res, { following: true }, 200, `Now following @${username}`);
  } catch (err) {
    // Gracefully handle duplicate key (race condition)
    if (err.code === 11000) {
      return success(res, { following: true }, 200, 'Already following');
    }
    console.error('[followUser]', err);
    return error(res, 'Follow action failed', 500);
  }
};