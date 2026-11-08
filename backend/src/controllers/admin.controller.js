const mongoose = require('mongoose');
const User = require('../models/User');
const Video = require('../models/Video');
const Report = require('../models/Report');
const AuditLog = require('../models/AuditLog');
const Comment = require('../models/Comment');
const commentService = require('../services/comment.service');
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
      flaggedVideos,
      pendingComments,
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
    const { search, role } = req.query;

    // Build the filter dynamically
    const filter = {};

    if (search && search.trim()) {
      const regex = new RegExp(escapeRegex(search.trim().slice(0, 100)), 'i');
      filter.$or = [{ username: regex }, { email: regex }];
    }

    if (role && ['user', 'admin', 'moderator'].includes(role)) {
      filter.role = role;
    }

    const [users, total] = await Promise.all([
      User.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select('-password -refreshTokens -__v'),
      User.countDocuments(filter),
    ]);

    return paginated(res, users, buildPagination(page, limit, total));
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
    user.banReason = reason || null;
    await user.save();
    // Thu hồi toàn bộ refresh token để buộc đăng xuất
    await User.updateOne({ _id: user._id }, { $set: { refreshTokens: [] } });

    await createAuditLog({
      adminId: req.user._id,
      action: 'ban_user',
      targetType: 'user',
      targetId: user._id,
      details: { reason: reason || null, username: user.username },
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
    const { status, moderationStatus } = req.query;

    const filter = {};

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
    video.moderationStatus = 'removed';
    video.reportCount = 0;
    await video.save();
    await resolveReports(video._id, req.user._id, 'removed');

    await createAuditLog({
      adminId: req.user._id,
      action: 'remove_video',
      targetType: 'video',
      targetId: video._id,
      details: {
        title: video.title,
        uploader: video.userId?.username,
        previousStatus,
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
    // Báo cáo đã xem xét xong → đếm lại từ 0 (video bị gắn cờ lại nếu có đủ báo cáo mới)
    video.reportCount = 0;
    await video.save();
    await resolveReports(video._id, req.user._id, 'kept');

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
      ['ban_user', 'unban_user', 'verify_user', 'remove_video', 'approve_video', 'flag_video', 'approve_comment', 'reject_comment'].includes(
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
