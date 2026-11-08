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
const Block = require('../models/Block');
const privacyService = require('../services/privacy.service');
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

    // Quyền riêng tư: bị người này chặn → như không tồn tại; mình chặn họ → giao diện hiện "Bỏ chặn"
    const rel = await privacyService.relation(req.user, user._id);
    if (rel.blockedMe && !privacyService.isStaff(req.user)) return error(res, 'User not found', 404);
    const access = privacyService.profileAccess(user, rel, req.user);
    const privacy = isOwner ? privacyService.settingsOf(user) : undefined;
    delete user.privacy;

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
      followsYou: rel.followedBy,
      isFriend: rel.friends,
      isBlocked: rel.blockedByMe,
      access, // { followers, following, liked, reposts }: người xem được mở các mục này không
      ...(privacy && { privacy }),
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
    if (!privacyService.isStaff(req.user) && (await privacyService.isBlockedBetween(req.user?._id, user._id))) {
      return paginated(res, [], { nextCursor: null, hasMore: false, limit });
    }

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
    await videoService.attachViewerFlags(videos, req.user?._id);

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
/**
 * GET /users/me/saved?cursor=&limit=
 * Video đã lưu của chính mình (người khác không xem được).
 */
exports.getSavedVideos = async (req, res) => {
  const cursor = req.query.cursor ?? req.query.page;
  if (cursor && !/^\d{1,6}$/.test(String(cursor))) return error(res, 'Invalid cursor', 400);
  const { videos, nextCursor } = await videoService.getSavedVideos(req.user._id, cursor, req.query.limit);
  return paginated(res, videos, { nextCursor, hasMore: Boolean(nextCursor) });
};

const parseCursor = (req, res) => {
  const cursor = req.query.cursor ?? req.query.page;
  if (cursor && !/^\d{1,6}$/.test(String(cursor))) {
    error(res, 'Invalid cursor', 400);
    return { bad: true };
  }
  return { cursor };
};

/**
 * GET /users/me/liked?cursor=&limit=
 * Video mình đã thả tim (chỉ chủ tài khoản xem được).
 */
exports.getLikedVideos = async (req, res) => {
  const { cursor, bad } = parseCursor(req, res);
  if (bad) return undefined;
  const { videos, nextCursor } = await videoService.getLikedVideos(req.user._id, cursor, req.query.limit);
  return paginated(res, videos, { nextCursor, hasMore: Boolean(nextCursor) });
};

/**
 * GET /users/:username/reposts?cursor=&limit=
 * Video người này đã đăng lại (công khai).
 */
exports.getUserReposts = async (req, res) => {
  const { cursor, bad } = parseCursor(req, res);
  if (bad) return undefined;
  const user = await findUserByParam(req.params.username, '_id privacy').lean();
  if (!user) return error(res, 'User not found', 404);
  const denied = await denyIfHidden(req, res, user, 'reposts');
  if (denied) return denied;
  const { videos, nextCursor } = await videoService.getUserReposts(user._id, cursor, req.query.limit, req.user?._id);
  return paginated(res, videos, { nextCursor, hasMore: Boolean(nextCursor) });
};

/**
 * Chặn xem mục bị ẩn theo cài đặt quyền riêng tư.
 * Bị chủ tài khoản chặn → 404; mục ẩn → 403 code PRIVATE (giao diện hiện "🔒 đã ẩn").
 */
async function denyIfHidden(req, res, user, key) {
  const rel = await privacyService.relation(req.user, user._id);
  if (rel.blockedMe && !privacyService.isStaff(req.user)) return error(res, 'User not found', 404);
  if (!privacyService.profileAccess(user, rel, req.user)[key]) {
    return res.status(403).json({ success: false, code: 'PRIVATE', message: 'Người dùng đã ẩn mục này' });
  }
  return null;
}

/**
 * GET /users/:username/liked — video người này đã thả tim (theo cài đặt "Ai xem được video đã thích")
 */
exports.getUserLiked = async (req, res) => {
  const { cursor, bad } = parseCursor(req, res);
  if (bad) return undefined;
  const user = await findUserByParam(req.params.username, '_id privacy').lean();
  if (!user) return error(res, 'User not found', 404);
  const denied = await denyIfHidden(req, res, user, 'liked');
  if (denied) return denied;
  const { videos, nextCursor } = await videoService.getLikedVideos(user._id, cursor, req.query.limit, req.user?._id);
  return paginated(res, videos, { nextCursor, hasMore: Boolean(nextCursor) });
};

const LIST_FIELDS = 'username displayName avatarUrl isVerified followerCount bannedAt';

/**
 * GET /users/:username/followers | /following ?cursor=&limit=&q=
 * Danh sách người theo dõi / đang theo dõi (mới nhất trước), có tìm theo tên.
 * Mỗi người kèm isFollowing (mình có theo dõi họ không) và followsYou (họ có theo dõi mình không).
 */
const listFollows = (kind) => async (req, res) => {
  const { cursor, bad } = parseCursor(req, res);
  if (bad) return undefined;
  const user = await findUserByParam(req.params.username, '_id privacy').lean();
  if (!user) return error(res, 'User not found', 404);
  const denied = await denyIfHidden(req, res, user, kind);
  if (denied) return denied;

  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 50);
  const page = cursor ? parseInt(cursor, 10) : 0;
  const [mine, theirs] = kind === 'followers' ? ['followingId', 'followerId'] : ['followerId', 'followingId'];
  const filter = { [mine]: user._id };

  // Ẩn người đã chặn nhau với người xem
  const hidden = await privacyService.blockedIdSet(req.user?._id);
  const q = typeof req.query.q === 'string' ? req.query.q.trim().replace(/^@/, '').slice(0, 30) : '';
  if (q) {
    const re = new RegExp(escapeRegex(q), 'i');
    const matched = await User.find({ $or: [{ username: re }, { displayName: re }] }).select('_id').limit(2000).lean();
    filter[theirs] = { $in: matched.map((u) => u._id).filter((id) => !hidden.has(String(id))) };
  } else if (hidden.size) {
    filter[theirs] = { $nin: [...hidden].map((id) => new mongoose.Types.ObjectId(id)) };
  }

  const rows = await Follow.find(filter)
    .sort({ _id: -1 })
    .skip(page * limit)
    .limit(limit + 1)
    .populate(theirs, LIST_FIELDS)
    .lean();
  const hasMore = rows.length > limit;
  const people = rows.slice(0, limit).map((r) => r[theirs]).filter((u) => u && !u.bannedAt);

  // Quan hệ của người xem với từng người trong danh sách
  let iFollow = new Set();
  let followMe = new Set();
  if (req.user && people.length) {
    const ids = people.map((u) => u._id);
    const [a, b] = await Promise.all([
      Follow.find({ followerId: req.user._id, followingId: { $in: ids } }).select('followingId').lean(),
      Follow.find({ followingId: req.user._id, followerId: { $in: ids } }).select('followerId').lean(),
    ]);
    iFollow = new Set(a.map((f) => String(f.followingId)));
    followMe = new Set(b.map((f) => String(f.followerId)));
  }
  const data = people.map(({ bannedAt, ...u }) => ({
    ...u,
    isMe: Boolean(req.user && String(u._id) === String(req.user._id)),
    isFollowing: iFollow.has(String(u._id)),
    followsYou: followMe.has(String(u._id)),
  }));
  return paginated(res, data, { nextCursor: hasMore ? String(page + 1) : null, hasMore });
};
exports.getFollowers = listFollows('followers');
exports.getFollowing = listFollows('following');

/** Xoá 1 bản ghi theo dõi + cập nhật bộ đếm 2 phía (trả true nếu thực sự xoá được) */
async function removeFollow(followerId, followingId) {
  const { deletedCount } = await Follow.deleteOne({ followerId, followingId });
  if (!deletedCount) return false;
  FollowEvent.create({ followerId, followingId, action: 'unfollow' }).catch(() => {});
  await User.updateOne({ _id: followerId }, { $inc: { followingCount: -1 } });
  await User.updateOne({ _id: followingId }, { $inc: { followerCount: -1 } });
  return true;
}

/**
 * DELETE /users/me/followers/:userId — xoá 1 người khỏi danh sách người theo dõi mình
 * (họ không được báo; có thể theo dõi lại sau).
 */
exports.removeFollower = async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.userId)) return error(res, 'Invalid user id', 400);
  const removed = await removeFollow(req.params.userId, req.user._id);
  if (!removed) return error(res, 'Người này không theo dõi bạn', 404);
  return success(res, { removed: true }, 200, 'Follower removed');
};

/**
 * POST /users/:username/block — chặn: tự bỏ theo dõi 2 chiều, 2 bên không thấy / tương tác được với nhau.
 */
exports.blockUser = async (req, res) => {
  const target = await User.findOne({ username: req.params.username }).collation({ locale: 'en', strength: 2 }).select('_id username role').lean();
  if (!target) return error(res, 'User not found', 404);
  if (String(target._id) === String(req.user._id)) return error(res, 'Bạn không thể chặn chính mình', 400);
  try {
    await Block.create({ blockerId: req.user._id, blockedId: target._id });
  } catch (err) {
    if (err.code !== 11000) throw err;
  }
  await Promise.all([removeFollow(req.user._id, target._id), removeFollow(target._id, req.user._id)]);
  return success(res, { blocked: true }, 200, `Đã chặn @${target.username}`);
};

/** DELETE /users/:username/block — bỏ chặn (không tự theo dõi lại) */
exports.unblockUser = async (req, res) => {
  const target = await User.findOne({ username: req.params.username }).collation({ locale: 'en', strength: 2 }).select('_id username').lean();
  if (!target) return error(res, 'User not found', 404);
  await Block.deleteOne({ blockerId: req.user._id, blockedId: target._id });
  return success(res, { blocked: false }, 200, `Đã bỏ chặn @${target.username}`);
};

/** GET /users/me/blocked — danh sách tài khoản mình đã chặn */
exports.getBlockedUsers = async (req, res) => {
  const rows = await Block.find({ blockerId: req.user._id })
    .sort({ _id: -1 })
    .limit(500)
    .populate('blockedId', 'username displayName avatarUrl isVerified')
    .lean();
  return success(res, rows.filter((r) => r.blockedId).map((r) => ({ ...r.blockedId, blockedAt: r.createdAt })));
};

/** GET /users/me/privacy */
exports.getPrivacy = async (req, res) => success(res, privacyService.settingsOf(req.user.toObject?.() ?? req.user));

/** PATCH /users/me/privacy — cập nhật 1 hoặc nhiều cài đặt */
exports.updatePrivacy = async (req, res) => {
  const { value, error: msg } = privacyService.validate(req.body);
  if (msg) return error(res, msg, 400);
  const $set = Object.fromEntries(Object.entries(value).map(([k, v]) => [`privacy.${k}`, v]));
  const user = await User.findByIdAndUpdate(req.user._id, { $set }, { new: true }).select('privacy').lean();
  return success(res, privacyService.settingsOf(user), 200, 'Đã lưu cài đặt quyền riêng tư');
};

/**
 * GET /users/mention-suggest?q=
 * Gợi ý người để tag khi gõ "@": ưu tiên username bắt đầu bằng q, rồi người mình đang theo dõi.
 * q rỗng → trả về những người mình đang theo dõi (nếu đã đăng nhập).
 */
exports.mentionSuggest = async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim().replace(/^@/, '').slice(0, 30) : '';
  if (q && !/^[a-zA-Z0-9_]+$/.test(q)) return success(res, []);
  const fields = 'username displayName avatarUrl isVerified followerCount privacy.mentionPermission';

  let followingIds = [];
  if (req.user) {
    const follows = await Follow.find({ followerId: req.user._id }).select('followingId').limit(500).lean();
    followingIds = follows.map((f) => f.followingId);
  }

  // Không gợi ý: chính mình, người đã chặn nhau, người tắt "hiện trong gợi ý", người không cho tag
  const hidden = await privacyService.blockedIdSet(req.user?._id);
  const notIds = [...(req.user ? [req.user._id] : []), ...[...hidden].map((id) => new mongoose.Types.ObjectId(id))];
  const base = {
    bannedAt: null,
    'privacy.discoverable': { $ne: false },
    'privacy.mentionPermission': { $ne: 'no_one' },
    ...(notIds.length && { _id: { $nin: notIds } }),
  };
  let users;
  if (!q) {
    if (!followingIds.length) return success(res, []);
    users = await User.find({ ...base, _id: { $in: followingIds, $nin: notIds } })
      .select(fields).sort({ followerCount: -1 }).limit(30).lean();
  } else {
    const prefix = new RegExp(`^${escapeRegex(q)}`, 'i');
    users = await User.find({ ...base, $or: [{ username: prefix }, { displayName: prefix }] })
      .select(fields).sort({ followerCount: -1 }).limit(30).lean();
  }
  const following = new Set(followingIds.map(String));
  // Người chỉ cho "người họ theo dõi" tag → chỉ gợi ý khi họ đang theo dõi mình
  const restricted = users.filter((u) => u.privacy?.mentionPermission === 'following');
  if (restricted.length) {
    const ok = req.user
      ? new Set((await Follow.find({ followerId: { $in: restricted.map((u) => u._id) }, followingId: req.user._id }).select('followerId').lean()).map((f) => String(f.followerId)))
      : new Set();
    users = users.filter((u) => u.privacy?.mentionPermission !== 'following' || ok.has(String(u._id)));
  }
  users.forEach((u) => delete u.privacy);
  users.sort((a, b) => Number(following.has(String(b._id))) - Number(following.has(String(a._id))));
  return success(res, users.slice(0, 8));
};

exports.searchUsers = async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.trim().length === 0) {
      return error(res, 'Query parameter q is required', 400);
    }

    const hidden = await privacyService.blockedIdSet(req.user?._id);
    const users = await User.find(
      {
        username: { $regex: escapeRegex(q.trim().slice(0, 50)), $options: 'i' },
        bannedAt: null,
        // Người tắt "Hiện tôi trong tìm kiếm" không xuất hiện (trừ khi gõ đúng tên)
        $or: [{ 'privacy.discoverable': { $ne: false } }, { username: q.trim() }],
        ...(hidden.size && { _id: { $nin: [...hidden].map((id) => new mongoose.Types.ObjectId(id)) } }),
      },
      'username displayName avatarUrl bio followerCount videoCount isVerified'
    )
      .collation({ locale: 'en', strength: 2 })
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
    if (await privacyService.isBlockedBetween(req.user._id, targetUser._id)) {
      return error(res, 'Không thể theo dõi tài khoản này', 403);
    }
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
