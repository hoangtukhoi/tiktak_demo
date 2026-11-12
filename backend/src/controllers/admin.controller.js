const mongoose = require('mongoose');
const presence = require('../services/presence.service');
const User = require('../models/User');
const Video = require('../models/Video');
const Report = require('../models/Report');
const AuditLog = require('../models/AuditLog');
const Comment = require('../models/Comment');
const ContentReport = require('../models/ContentReport');
const commentService = require('../services/comment.service');
const notificationService = require('../services/notification.service');
const moderationService = require('../services/commentModeration.service');
const { success, error, paginated } = require('../utils/apiResponse');
const escapeRegex = require('../utils/escapeRegex');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a pagination meta object and the query skip value.
 * @param {number} page  - 1-based page number
 * @param {number} limit - documents per page
 * @param {number} total - total matching documents
 */
const buildPagination = (page, limit, total) => ({
  total,
  page,
  limit,
  totalPages: Math.ceil(total / limit),
  hasNextPage: page * limit < total,
  hasPrevPage: page > 1,
});

/**
 * Persist one entry in the audit trail.
 * Fire-and-forget: errors are logged to stderr but never propagate to callers.
 *
 * @param {object} opts
 * @param {string} opts.adminId    - ObjectId of the acting admin
 * @param {string} opts.action     - One of the AuditLog action enum values
 * @param {string} opts.targetType - 'user' | 'video' | 'comment'
 * @param {string} opts.targetId   - ObjectId of the affected document
 * @param {object} [opts.details]  - Any extra context worth recording
 */
const createAuditLog = async ({ adminId, action, targetType, targetId, details }) => {
  try {
    await AuditLog.create({ adminId, action, targetType, targetId, details });
  } catch (err) {
    console.error('[AuditLog] Failed to write audit entry:', err.message);
  }
};

const cleanReason = (v) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 300) : null);

/**
 * Báo cho chủ nội dung biết nội dung của họ vừa bị xử lý (hoặc được khôi phục).
 * context: video_removed | video_restored | comment_hidden | comment_restored
 * Không bao giờ làm hỏng thao tác chính nếu gửi lỗi.
 */
const notifyModeration = async (userId, context, { videoId, videoThumbnail, commentId, excerpt, reason } = {}) => {
  try {
    if (!userId) return;
    await notificationService.createNotification(userId, 'moderation', {
      context,
      videoId: videoId || undefined,
      videoThumbnail: videoThumbnail || undefined,
      commentId: commentId || undefined,
      excerpt: excerpt ? String(excerpt).slice(0, 120) : undefined,
      reason: reason || undefined,
    });
  } catch (err) {
    console.error('[Admin] notifyModeration error:', err.message);
  }
};

/** Đóng mọi báo cáo (bình luận / tài khoản) đang mở của 1 đối tượng */
const resolveContentReports = (targetType, targetId, adminId, resolution) =>
  ContentReport.updateMany(
    { targetType, targetId, status: { $ne: 'resolved' } },
    { $set: { status: 'resolved', resolution, resolvedBy: adminId, resolvedAt: new Date() } }
  );

/** Đóng mọi báo cáo đang mở của 1 video sau khi admin xử lý */
const resolveReports = (videoId, adminId, resolution) =>
  Report.updateMany(
    { videoId, status: { $ne: 'resolved' } },
    { $set: { status: 'resolved', resolution, resolvedBy: adminId, resolvedAt: new Date() } }
  );

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

/**
 * GET /admin/stats
 * Returns a high-level dashboard snapshot.
 */
exports.getStats = async (req, res) => {
  try {
    // Run all aggregations concurrently for performance
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const [
      totalUsers,
      newUsersToday,
      totalVideos,
      viewsAgg,
      pendingReports,
      flaggedVideos,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ createdAt: { $gte: startOfToday } }),
      Video.countDocuments(),
      // Sum all viewCount fields across the entire Video collection
      Video.aggregate([
        { $group: { _id: null, total: { $sum: '$viewCount' } } },
      ]),
      // Báo cáo cũ (chưa có trường status) cũng tính là chưa xử lý
      Report.countDocuments({ status: { $ne: 'resolved' } }),
      Video.countDocuments({ moderationStatus: 'flagged' }),
    ]);
    // Báo cáo bình luận / tài khoản: đếm số đối tượng đang bị báo cáo
    const [commentReportAgg, userReportAgg, bannedUsers] = await Promise.all([
      ContentReport.aggregate([{ $match: { targetType: 'comment', status: { $ne: 'resolved' } } }, { $group: { _id: '$targetId' } }, { $count: 'n' }]),
      ContentReport.aggregate([{ $match: { targetType: 'user', status: { $ne: 'resolved' } } }, { $group: { _id: '$targetId' } }, { $count: 'n' }]),
      User.countDocuments({ bannedAt: { $ne: null } }),
    ]);
    const pendingCommentReports = commentReportAgg[0]?.n || 0;
    const pendingUserReports = userReportAgg[0]?.n || 0;
    const pendingComments = await Comment.countDocuments({ moderationStatus: 'pending', isDeleted: false });

    const totalViews = viewsAgg.length > 0 ? viewsAgg[0].total : 0;

    return success(res, {
      users: totalUsers, // alias cho frontend (stats.users)
      videos: totalVideos, // alias cho frontend (stats.videos)
      totalUsers,
      newUsersToday,
      totalVideos,
      totalViews,
      pendingReports,
      pendingCommentReports,
      pendingUserReports,
      flaggedVideos,
      pendingComments,
      bannedUsers,
    });
  } catch (err) {
    console.error('[Admin] getStats error:', err);
    return error(res, 'Failed to fetch stats', 500);
  }
};

// ---------------------------------------------------------------------------
// User management
// ---------------------------------------------------------------------------

/**
 * GET /admin/users?page=1&limit=20&search=&role=
 * Paginated user list with optional text search and role filter.
 */
exports.getUsers = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;
    const { search, role, status } = req.query;

    // Build the filter dynamically
    const filter = {};
    if (status === 'banned') filter.bannedAt = { $ne: null };
    else if (status === 'active') filter.bannedAt = null;
    else if (status === 'verified') filter.isVerified = true;
    else if (status === 'online') {
      // Đang online: có hoạt động trong 5 phút gần nhất hoặc đang mở kết nối realtime
      filter.bannedAt = null;
      filter.$and = [{
        $or: [
          { lastActiveAt: { $gte: new Date(Date.now() - presence.ONLINE_WINDOW_MS) } },
          { _id: { $in: presence.connectedIds().filter((id) => mongoose.isValidObjectId(id)) } },
        ],
      }];
    }

    if (search && search.trim()) {
      const regex = new RegExp(escapeRegex(search.trim().slice(0, 100)), 'i');
      filter.$or = req.user.role === 'admin' ? [{ username: regex }, { email: regex }, { displayName: regex }] : [{ username: regex }, { displayName: regex }];
    }

    if (role && ['user', 'admin', 'moderator'].includes(role)) {
      filter.role = role;
    }

    const [users, total] = await Promise.all([
      User.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        // Kiểm duyệt viên không xem được email người dùng
        .select(req.user.role === 'admin' ? '-password -refreshTokens -__v' : '-password -refreshTokens -__v -email -googleId'),
      User.countDocuments(filter),
    ]);

    // isOnline: đang online thật (không phải "chưa bị khoá"); lastActiveAt: lần hoạt động gần nhất
    const data = users.map((u) => ({ ...u.toJSON(), isOnline: !u.bannedAt && presence.isOnline(u) }));
    return paginated(res, data, buildPagination(page, limit, total));
  } catch (err) {
    console.error('[Admin] getUsers error:', err);
    return error(res, 'Failed to fetch users', 500);
  }
};

/**
 * POST /admin/users/:id/ban
 * Body: { reason?: string }
 * Marks the user account as banned and records an audit log entry.
 */
exports.banUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    if (!mongoose.isValidObjectId(id)) {
      return error(res, 'Invalid user ID', 400);
    }

    const user = await User.findById(id);
    if (!user) return error(res, 'User not found', 404);

    // Idempotency guard — already banned
    if (user.bannedAt) {
      return error(res, 'User is already banned', 409);
    }

    // Không cho admin tự khoá mình hoặc khoá admin khác
    if (String(user._id) === String(req.user._id) || user.role === 'admin') {
      return error(res, 'Cannot ban this user', 403);
    }

    user.bannedAt = new Date();
    user.banReason = cleanReason(reason);
    await user.save();
    // Thu hồi toàn bộ refresh token để buộc đăng xuất
    await User.updateOne({ _id: user._id }, { $set: { refreshTokens: [] } });
    // Ẩn toàn bộ video + bình luận của tài khoản này cho tới khi mở khoá
    await Promise.all([
      Video.updateMany({ userId: user._id }, { $set: { authorBanned: true } }),
      Comment.updateMany({ userId: user._id }, { $set: { authorBanned: true } }),
      resolveContentReports('user', user._id, req.user._id, 'banned'),
    ]);

    await createAuditLog({
      adminId: req.user._id,
      action: 'ban_user',
      targetType: 'user',
      targetId: user._id,
      details: { reason: cleanReason(reason), username: user.username },
    });

    return success(res, user, 200, 'User banned successfully');
  } catch (err) {
    console.error('[Admin] banUser error:', err);
    return error(res, 'Failed to ban user', 500);
  }
};

/**
 * POST /admin/users/:id/unban
 * Clears ban fields and records an audit log entry.
 */
exports.unbanUser = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return error(res, 'Invalid user ID', 400);
    }

    const user = await User.findById(id);
    if (!user) return error(res, 'User not found', 404);

    if (!user.bannedAt) {
      return error(res, 'User is not banned', 409);
    }

    user.bannedAt = null;
    user.banReason = null;
    await user.save();
    // Hiện lại video + bình luận đã ẩn lúc khoá
    await Promise.all([
      Video.updateMany({ userId: user._id }, { $set: { authorBanned: false } }),
      Comment.updateMany({ userId: user._id }, { $set: { authorBanned: false } }),
    ]);

    await createAuditLog({
      adminId: req.user._id,
      action: 'unban_user',
      targetType: 'user',
      targetId: user._id,
      details: { username: user.username },
    });

    return success(res, user, 200, 'User unbanned successfully');
  } catch (err) {
    console.error('[Admin] unbanUser error:', err);
    return error(res, 'Failed to unban user', 500);
  }
};

/**
 * POST /admin/users/:id/verify
 * Grants the verified badge and records an audit log entry.
 */
exports.verifyUser = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return error(res, 'Invalid user ID', 400);
    }

    const user = await User.findById(id);
    if (!user) return error(res, 'User not found', 404);

    if (user.isVerified) {
      return error(res, 'User is already verified', 409);
    }

    user.isVerified = true;
    await user.save();

    await createAuditLog({
      adminId: req.user._id,
      action: 'verify_user',
      targetType: 'user',
      targetId: user._id,
      details: { username: user.username },
    });

    return success(res, user, 200, 'User verified successfully');
  } catch (err) {
    console.error('[Admin] verifyUser error:', err);
    return error(res, 'Failed to verify user', 500);
  }
};

// ---------------------------------------------------------------------------
// Video management
// ---------------------------------------------------------------------------

/**
 * GET /admin/videos?page=1&limit=20&status=&moderationStatus=
 * Paginated video list filterable by processing status and moderation status.
 */
exports.getVideos = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;
    const { status, moderationStatus, search } = req.query;

    const filter = {};
    if (search && search.trim()) {
      // Tìm theo tiêu đề hoặc tên người đăng
      const regex = new RegExp(escapeRegex(search.trim().slice(0, 100)), 'i');
      const owners = await User.find({ username: regex }).select('_id').limit(50).lean();
      filter.$or = [{ title: regex }, { userId: { $in: owners.map((u) => u._id) } }];
    }

    if (status && ['uploading', 'processing', 'ready', 'failed', 'deleted'].includes(status)) {
      filter.status = status;
    }

    if (
      moderationStatus &&
      ['pending', 'approved', 'removed', 'flagged'].includes(moderationStatus)
    ) {
      filter.moderationStatus = moderationStatus;
    }

    const [videos, total] = await Promise.all([
      Video.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('userId', 'username avatarUrl isVerified'),
      Video.countDocuments(filter),
    ]);

    return paginated(res, videos, buildPagination(page, limit, total));
  } catch (err) {
    console.error('[Admin] getVideos error:', err);
    return error(res, 'Failed to fetch videos', 500);
  }
};

/**
 * DELETE /admin/videos/:id
 * Soft-deletes a video by setting its moderationStatus to 'removed'.
 */
exports.removeVideo = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return error(res, 'Invalid video ID', 400);
    }

    const video = await Video.findById(id).populate('userId', 'username');
    if (!video) return error(res, 'Video not found', 404);

    if (video.moderationStatus === 'removed') {
      return error(res, 'Video is already removed', 409);
    }

    const previousStatus = video.moderationStatus;
    const reason = cleanReason(req.body?.reason);
    video.moderationStatus = 'removed';
    video.removeReason = reason;
    video.reportCount = 0;
    await video.save();
    await resolveReports(video._id, req.user._id, 'removed');
    await notifyModeration(video.userId?._id || video.userId, 'video_removed', {
      videoId: video._id, videoThumbnail: video.thumbnailUrl, excerpt: video.title, reason,
    });

    await createAuditLog({
      adminId: req.user._id,
      action: 'remove_video',
      targetType: 'video',
      targetId: video._id,
      details: {
        title: video.title,
        uploader: video.userId?.username,
        previousStatus,
        reason,
      },
    });

    return success(res, video, 200, 'Video removed successfully');
  } catch (err) {
    console.error('[Admin] removeVideo error:', err);
    return error(res, 'Failed to remove video', 500);
  }
};

/**
 * POST /admin/videos/:id/approve
 * Approves a video, clearing any flagged/pending status.
 */
exports.approveVideo = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return error(res, 'Invalid video ID', 400);
    }

    const video = await Video.findById(id).populate('userId', 'username');
    if (!video) return error(res, 'Video not found', 404);

    const openReports = await Report.countDocuments({ videoId: video._id, status: { $ne: 'resolved' } });
    if (video.moderationStatus === 'approved' && !openReports) {
      return error(res, 'Video is already approved', 409);
    }

    const previousStatus = video.moderationStatus;
    video.moderationStatus = 'approved';
    // Clear flag metadata when explicitly approved by an admin
    video.flagReason = null;
    video.removeReason = null;
    // Báo cáo đã xem xét xong → đếm lại từ 0 (video bị gắn cờ lại nếu có đủ báo cáo mới)
    video.reportCount = 0;
    await video.save();
    await resolveReports(video._id, req.user._id, 'kept');
    // Video từng bị gỡ nay được khôi phục → báo cho chủ video
    if (previousStatus === 'removed') {
      await notifyModeration(video.userId?._id || video.userId, 'video_restored', {
        videoId: video._id, videoThumbnail: video.thumbnailUrl, excerpt: video.title,
      });
    }

    await createAuditLog({
      adminId: req.user._id,
      action: 'approve_video',
      targetType: 'video',
      targetId: video._id,
      details: {
        title: video.title,
        uploader: video.userId?.username,
        previousStatus,
      },
    });

    return success(res, video, 200, 'Video approved successfully');
  } catch (err) {
    console.error('[Admin] approveVideo error:', err);
    return error(res, 'Failed to approve video', 500);
  }
};

/**
 * GET /admin/videos/flagged?page=1&limit=20
 * Lists flagged videos sorted by report count (most reported first).
 * Each video is enriched with its associated Report documents.
 */
exports.getFlaggedVideos = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const filter = { moderationStatus: 'flagged' };

    const [videos, total] = await Promise.all([
      Video.find(filter)
        .sort({ reportCount: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('userId', 'username avatarUrl isVerified'),
      Video.countDocuments(filter),
    ]);

    if (videos.length === 0) {
      return paginated(res, [], buildPagination(page, limit, total));
    }

    // Fetch all reports for the returned videos in a single query to avoid N+1
    const videoIds = videos.map((v) => v._id);
    const reports = await Report.find({ videoId: { $in: videoIds } })
      .populate('reporterId', 'username avatarUrl')
      .sort({ createdAt: -1 })
      .lean();

    // Group reports by videoId for O(1) lookup
    const reportsByVideoId = reports.reduce((acc, report) => {
      const key = report.videoId.toString();
      if (!acc[key]) acc[key] = [];
      acc[key].push(report);
      return acc;
    }, {});

    // Attach reports array to each video's plain object representation
    const enriched = videos.map((video) => {
      const obj = video.toObject();
      obj.reports = reportsByVideoId[video._id.toString()] || [];
      return obj;
    });

    return paginated(res, enriched, buildPagination(page, limit, total));
  } catch (err) {
    console.error('[Admin] getFlaggedVideos error:', err);
    return error(res, 'Failed to fetch flagged videos', 500);
  }
};

// ---------------------------------------------------------------------------
// Reports (báo cáo video)
// ---------------------------------------------------------------------------

/**
 * GET /admin/reports?page=1&limit=20&status=open|resolved
 * Báo cáo gom theo video: số báo cáo, thống kê lý do, vài báo cáo gần nhất.
 * Video nhiều báo cáo đang mở nhất lên đầu.
 */
exports.getReports = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const status = req.query.status === 'resolved' ? 'resolved' : 'open';
    const match = status === 'open' ? { status: { $ne: 'resolved' } } : { status: 'resolved' };

    const [groups, totalAgg] = await Promise.all([
      Report.aggregate([
        { $match: match },
        { $sort: { createdAt: -1 } },
        {
          $group: {
            _id: '$videoId',
            count: { $sum: 1 },
            lastReportedAt: { $first: '$createdAt' },
            reasons: { $push: '$reason' },
            latest: { $push: { _id: '$_id', reason: '$reason', note: '$note', reporterId: '$reporterId', createdAt: '$createdAt', resolution: '$resolution' } },
          },
        },
        { $sort: { count: -1, lastReportedAt: -1 } },
        { $skip: (page - 1) * limit },
        { $limit: limit },
        { $project: { count: 1, lastReportedAt: 1, reasons: 1, latest: { $slice: ['$latest', 5] } } },
      ]),
      Report.aggregate([{ $match: match }, { $group: { _id: '$videoId' } }, { $count: 'n' }]),
    ]);
    const total = totalAgg[0]?.n || 0;

    const videoIds = groups.map((g) => g._id);
    const reporterIds = [...new Set(groups.flatMap((g) => g.latest.map((r) => String(r.reporterId))))];
    const [videos, reporters] = await Promise.all([
      Video.find({ _id: { $in: videoIds } }).populate('userId', 'username avatarUrl isVerified').lean(),
      User.find({ _id: { $in: reporterIds } }).select('username avatarUrl').lean(),
    ]);
    const videoById = new Map(videos.map((v) => [String(v._id), v]));
    const reporterById = new Map(reporters.map((u) => [String(u._id), u]));

    const data = groups
      .map((g) => {
        const video = videoById.get(String(g._id));
        if (!video) return null; // video đã bị xoá hẳn
        const reasonCounts = g.reasons.reduce((acc, r) => ({ ...acc, [r]: (acc[r] || 0) + 1 }), {});
        return {
          ...video,
          openReports: g.count,
          lastReportedAt: g.lastReportedAt,
          reasonCounts,
          reports: g.latest.map((r) => ({ ...r, reporterId: reporterById.get(String(r.reporterId)) || null })),
        };
      })
      .filter(Boolean);

    return paginated(res, data, buildPagination(page, limit, total));
  } catch (err) {
    console.error('[Admin] getReports error:', err);
    return error(res, 'Failed to fetch reports', 500);
  }
};

// ---------------------------------------------------------------------------
// Comment moderation (kiểm duyệt bình luận)
// ---------------------------------------------------------------------------

/**
 * GET /admin/comments?status=pending|rejected|approved&page=&limit=&sort=score|new
 * Hàng chờ kiểm duyệt bình luận. Mặc định: đang chờ, điểm vi phạm cao nhất trước.
 */
exports.getModerationComments = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 30));
    const status = ['pending', 'rejected', 'approved'].includes(req.query.status) ? req.query.status : 'pending';

    const filter = { isDeleted: false, moderationStatus: status };
    // Tab "đã duyệt": chỉ bình luận từng được chấm điểm / được admin xem
    if (status === 'approved') filter['moderation.source'] = { $in: ['model', 'keyword', 'admin'] };
    const sort = req.query.sort === 'new' || status !== 'pending' ? { _id: -1 } : { 'moderation.score': -1, _id: -1 };
    // Tìm theo nội dung bình luận hoặc tên người viết
    const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 100) : '';
    if (search) {
      const regex = new RegExp(escapeRegex(search), 'i');
      const authors = await User.find({ username: regex }).select('_id').limit(50).lean();
      filter.$or = [{ content: regex }, { userId: { $in: authors.map((u) => u._id) } }];
      delete filter['moderation.source']; // tìm thì xem được mọi bình luận, kể cả chưa từng chấm điểm
    }

    const [comments, total] = await Promise.all([
      Comment.find(filter)
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('userId', 'username avatarUrl isVerified bannedAt')
        .populate('videoId', 'title thumbnailUrl')
        .populate('moderation.reviewedBy', 'username')
        .lean(),
      Comment.countDocuments(filter),
    ]);

    return paginated(res, comments, buildPagination(page, limit, total));
  } catch (err) {
    console.error('[Admin] getModerationComments error:', err);
    return error(res, 'Failed to fetch comments', 500);
  }
};

/** Đổi trạng thái kiểm duyệt của 1 bình luận (approve / reject) */
const reviewComment = (target) => async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return error(res, 'Invalid comment ID', 400);

    const before = await Comment.findOne({ _id: id, isDeleted: false }).lean();
    if (!before) return error(res, 'Comment not found', 404);
    if (before.moderationStatus === target) {
      return error(res, target === 'approved' ? 'Comment is already approved' : 'Comment is already hidden', 409);
    }

    // Cập nhật có điều kiện: 2 admin bấm cùng lúc thì chỉ 1 người đổi được bộ đếm
    const updated = await Comment.findOneAndUpdate(
      { _id: id, isDeleted: false, moderationStatus: before.moderationStatus },
      {
        $set: {
          moderationStatus: target,
          'moderation.reviewedBy': req.user._id,
          'moderation.reviewedAt': new Date(),
          ...(before.moderation?.source ? {} : { 'moderation.source': 'admin' }),
        },
      },
      { new: true }
    );
    if (!updated) return error(res, 'Comment was changed by someone else, reload and try again', 409);

    const wasPublic = commentService.isPublicStatus(before.moderationStatus);
    const nowPublic = commentService.isPublicStatus(target);
    if (!wasPublic && nowPublic) {
      // Lần đầu hiện công khai → tăng bộ đếm + gửi thông báo đã hoãn lúc đăng
      await commentService.publish(updated);
    } else if (wasPublic && !nowPublic) {
      await commentService.applyCounters(updated, -1);
    }

    // Báo cho người viết: bị ẩn (kèm lý do nếu có) hoặc được hiện lại sau khi từng bị ẩn / chờ duyệt
    const reason = cleanReason(req.body?.reason);
    if (target === 'rejected') {
      await resolveContentReports('comment', updated._id, req.user._id, 'hidden');
      await notifyModeration(updated.userId, 'comment_hidden', {
        videoId: updated.videoId, commentId: updated._id, excerpt: updated.content, reason,
      });
    } else if (!wasPublic) {
      await notifyModeration(updated.userId, 'comment_restored', {
        videoId: updated.videoId, commentId: updated._id, excerpt: updated.content,
      });
    }

    await createAuditLog({
      adminId: req.user._id,
      action: target === 'approved' ? 'approve_comment' : 'reject_comment',
      targetType: 'comment',
      targetId: updated._id,
      details: {
        previousStatus: before.moderationStatus,
        score: before.moderation?.score ?? null,
        content: String(before.content).slice(0, 200),
      },
    });

    await updated.populate('userId', 'username avatarUrl isVerified');
    return success(res, updated, 200, target === 'approved' ? 'Comment approved' : 'Comment hidden');
  } catch (err) {
    console.error('[Admin] reviewComment error:', err);
    return error(res, 'Failed to update comment', 500);
  }
};

/** POST /admin/comments/:id/approve — hiện bình luận */
exports.approveComment = reviewComment('approved');
/** POST /admin/comments/:id/reject — ẩn bình luận */
exports.rejectComment = reviewComment('rejected');

/**
 * GET /admin/moderation/status
 * Bộ kiểm duyệt bình luận đang chạy bằng gì: model NLP hay bộ lọc từ khoá, và ngưỡng 3 mức.
 */
exports.getModerationStatus = async (req, res) => {
  try {
    return success(res, await moderationService.status());
  } catch (err) {
    console.error('[Admin] getModerationStatus error:', err);
    return error(res, 'Failed to fetch moderation status', 500);
  }
};

// ---------------------------------------------------------------------------
// Vai trò & tích xanh
// ---------------------------------------------------------------------------

/**
 * POST /admin/users/:id/role   Body: { role: 'user' | 'moderator' | 'admin' }
 * Đổi vai trò. Không tự đổi vai trò của mình (tránh lỡ tay mất quyền admin cuối cùng).
 */
exports.changeRole = async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body || {};
    if (!mongoose.isValidObjectId(id)) return error(res, 'Invalid user ID', 400);
    if (!['user', 'moderator', 'admin'].includes(role)) return error(res, 'role phải là user, moderator hoặc admin', 400);
    if (String(id) === String(req.user._id)) return error(res, 'Không thể tự đổi vai trò của mình', 403);

    const user = await User.findById(id);
    if (!user) return error(res, 'User not found', 404);
    if (user.role === role) return error(res, 'Người dùng đã có vai trò này', 409);
    if (user.bannedAt && role !== 'user') return error(res, 'Tài khoản đang bị khoá', 409);

    const previousRole = user.role;
    user.role = role;
    await user.save();
    // Token cũ còn ghi vai trò cũ → buộc đăng nhập lại để nhận quyền mới
    await User.updateOne({ _id: user._id }, { $set: { refreshTokens: [] } });

    await createAuditLog({
      adminId: req.user._id,
      action: 'change_role',
      targetType: 'user',
      targetId: user._id,
      details: { username: user.username, previousRole, role },
    });
    return success(res, user, 200, 'Role updated');
  } catch (err) {
    console.error('[Admin] changeRole error:', err);
    return error(res, 'Failed to change role', 500);
  }
};

/** POST /admin/users/:id/unverify — thu lại tích xanh */
exports.unverifyUser = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return error(res, 'Invalid user ID', 400);
    const user = await User.findById(id);
    if (!user) return error(res, 'User not found', 404);
    if (!user.isVerified) return error(res, 'User is not verified', 409);
    user.isVerified = false;
    await user.save();
    await createAuditLog({
      adminId: req.user._id,
      action: 'unverify_user',
      targetType: 'user',
      targetId: user._id,
      details: { username: user.username },
    });
    return success(res, user, 200, 'Verification removed');
  } catch (err) {
    console.error('[Admin] unverifyUser error:', err);
    return error(res, 'Failed to unverify user', 500);
  }
};

// ---------------------------------------------------------------------------
// Báo cáo bình luận / tài khoản
// ---------------------------------------------------------------------------

/**
 * GET /admin/reports/comments | /admin/reports/users   ?status=open|resolved&page=&limit=
 * Gom theo đối tượng bị báo cáo: số báo cáo, thống kê lý do, vài báo cáo gần nhất.
 */
const listContentReports = (targetType) => async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const status = req.query.status === 'resolved' ? 'resolved' : 'open';
    const match = { targetType, ...(status === 'open' ? { status: { $ne: 'resolved' } } : { status: 'resolved' }) };

    const [groups, totalAgg] = await Promise.all([
      ContentReport.aggregate([
        { $match: match },
        { $sort: { createdAt: -1 } },
        {
          $group: {
            _id: '$targetId',
            count: { $sum: 1 },
            lastReportedAt: { $first: '$createdAt' },
            reasons: { $push: '$reason' },
            latest: { $push: { _id: '$_id', reason: '$reason', note: '$note', reporterId: '$reporterId', createdAt: '$createdAt', resolution: '$resolution' } },
          },
        },
        { $sort: { count: -1, lastReportedAt: -1 } },
        { $skip: (page - 1) * limit },
        { $limit: limit },
        { $project: { count: 1, lastReportedAt: 1, reasons: 1, latest: { $slice: ['$latest', 5] } } },
      ]),
      ContentReport.aggregate([{ $match: match }, { $group: { _id: '$targetId' } }, { $count: 'n' }]),
    ]);
    const total = totalAgg[0]?.n || 0;
    const ids = groups.map((g) => g._id);
    const reporterIds = [...new Set(groups.flatMap((g) => g.latest.map((r) => String(r.reporterId))))];
    const [targets, reporters] = await Promise.all([
      targetType === 'comment'
        ? Comment.find({ _id: { $in: ids } }).populate('userId', 'username avatarUrl isVerified bannedAt').populate('videoId', 'title thumbnailUrl').lean()
        : User.find({ _id: { $in: ids } }).select('username displayName avatarUrl isVerified role bannedAt banReason followerCount videoCount createdAt').lean(),
      User.find({ _id: { $in: reporterIds } }).select('username avatarUrl').lean(),
    ]);
    const targetById = new Map(targets.map((t) => [String(t._id), t]));
    const reporterById = new Map(reporters.map((u) => [String(u._id), u]));

    const data = groups
      .map((g) => {
        const target = targetById.get(String(g._id));
        if (!target) return null; // đã bị xoá hẳn
        return {
          ...target,
          openReports: g.count,
          lastReportedAt: g.lastReportedAt,
          reasonCounts: g.reasons.reduce((acc, r) => ({ ...acc, [r]: (acc[r] || 0) + 1 }), {}),
          reports: g.latest.map((r) => ({ ...r, reporterId: reporterById.get(String(r.reporterId)) || null })),
        };
      })
      .filter(Boolean);
    return paginated(res, data, buildPagination(page, limit, total));
  } catch (err) {
    console.error('[Admin] listContentReports error:', err);
    return error(res, 'Failed to fetch reports', 500);
  }
};
exports.getCommentReports = listContentReports('comment');
exports.getUserReports = listContentReports('user');

/**
 * POST /admin/reports/comments/:id/dismiss | /admin/reports/users/:id/dismiss
 * Bỏ qua: nội dung không vi phạm → đóng các báo cáo đang mở, giữ nguyên nội dung.
 * (Muốn xử lý thì dùng "ẩn bình luận" / "khoá tài khoản" — các thao tác đó tự đóng báo cáo.)
 */
const dismissContentReports = (targetType) => async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return error(res, 'Invalid ID', 400);
    const r = await resolveContentReports(targetType, id, req.user._id, 'dismissed');
    if (!r.modifiedCount) return error(res, 'Không có báo cáo nào đang mở', 404);
    await createAuditLog({
      adminId: req.user._id,
      action: 'dismiss_report',
      targetType,
      targetId: id,
      details: { reports: r.modifiedCount },
    });
    return success(res, { resolved: r.modifiedCount }, 200, 'Reports dismissed');
  } catch (err) {
    console.error('[Admin] dismissContentReports error:', err);
    return error(res, 'Failed to dismiss reports', 500);
  }
};
exports.dismissCommentReports = dismissContentReports('comment');
exports.dismissUserReports = dismissContentReports('user');

// ---------------------------------------------------------------------------
// Audit logs
// ---------------------------------------------------------------------------

/**
 * GET /admin/audit-logs?page=1&limit=50&adminId=&action=
 * Paginated audit log with optional filtering by admin or action type.
 */
exports.getAuditLogs = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));
    const skip = (page - 1) * limit;
    const { adminId, action } = req.query;

    const filter = {};

    if (adminId && mongoose.isValidObjectId(adminId)) {
      filter.adminId = adminId;
    }

    if (
      action &&
      AuditLog.schema.path('action').enumValues.includes(
        action
      )
    ) {
      filter.action = action;
    }

    const [logs, total] = await Promise.all([
      AuditLog.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('adminId', 'username avatarUrl role'),
      AuditLog.countDocuments(filter),
    ]);

    return paginated(res, logs, buildPagination(page, limit, total));
  } catch (err) {
    console.error('[Admin] getAuditLogs error:', err);
    return error(res, 'Failed to fetch audit logs', 500);
  }
};
