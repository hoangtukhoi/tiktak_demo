const mongoose = require('mongoose');
const User = require('../models/User');
const Video = require('../models/Video');
const Report = require('../models/Report');
const AuditLog = require('../models/AuditLog');
const { success, error, paginated } = require('../utils/apiResponse');

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
      Report.countDocuments(),
      Video.countDocuments({ moderationStatus: 'flagged' }),
    ]);

    const totalViews = viewsAgg.length > 0 ? viewsAgg[0].total : 0;

    return success(res, {
      totalUsers,
      newUsersToday,
      totalVideos,
      totalViews,
      pendingReports,
      flaggedVideos,
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
      const regex = new RegExp(search.trim(), 'i');
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

    user.bannedAt = new Date();
    user.banReason = reason || null;
    await user.save();

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

    if (status && ['uploading', 'processing', 'ready', 'failed'].includes(status)) {
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

    video.moderationStatus = 'removed';
    await video.save();

    await createAuditLog({
      adminId: req.user._id,
      action: 'remove_video',
      targetType: 'video',
      targetId: video._id,
      details: {
        title: video.title,
        uploader: video.userId?.username,
        previousStatus: video.moderationStatus,
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

    if (video.moderationStatus === 'approved') {
      return error(res, 'Video is already approved', 409);
    }

    const previousStatus = video.moderationStatus;
    video.moderationStatus = 'approved';
    // Clear flag metadata when explicitly approved by an admin
    video.flagReason = null;
    await video.save();

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
      ['ban_user', 'unban_user', 'verify_user', 'remove_video', 'approve_video', 'flag_video'].includes(
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