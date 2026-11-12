const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin.controller');
const analyticsController = require('../controllers/analytics.controller');
const { authenticate, requireRole } = require('../middlewares/auth.middleware');

/**
 * Phân quyền:
 *  - moderator (kiểm duyệt viên): xem số liệu tổng quan, duyệt / gỡ video, xử lý báo cáo,
 *    duyệt / ẩn bình luận, xem danh sách người dùng (không thấy email).
 *  - admin: thêm quản lý tài khoản (khoá, tích xanh, đổi vai trò), phân tích toàn hệ thống, nhật ký.
 */
router.use(authenticate, requireRole('admin', 'moderator'));
const adminOnly = requireRole('admin');

// ── Dashboard ──────────────────────────────────────────────────────────────
router.get('/stats', adminController.getStats);
router.get('/analytics', adminOnly, analyticsController.getAdminAnalytics);
router.get('/analytics/videos/:id', analyticsController.getAdminVideoAnalytics);

// ── User management ────────────────────────────────────────────────────────
router.get('/users', adminController.getUsers);
router.post('/users/:id/ban', adminOnly, adminController.banUser);
router.post('/users/:id/unban', adminOnly, adminController.unbanUser);
router.post('/users/:id/verify', adminOnly, adminController.verifyUser);
router.post('/users/:id/unverify', adminOnly, adminController.unverifyUser);
router.post('/users/:id/role', adminOnly, adminController.changeRole);

// ── Video management ───────────────────────────────────────────────────────
// IMPORTANT: static segment '/videos/flagged' MUST be registered before the
// parameterised '/videos/:id' routes.  Express matches routes in registration
// order; placing /flagged after /:id would cause Express to treat "flagged"
// as a value for the :id parameter, silently bypassing the intended handler.
router.get('/videos/flagged', adminController.getFlaggedVideos);
router.get('/videos', adminController.getVideos);
router.delete('/videos/:id', adminController.removeVideo); // body: { reason? }
router.post('/videos/:id/approve', adminController.approveVideo);

// ── Reports ────────────────────────────────────────────────────────────────
router.get('/reports', adminController.getReports); // báo cáo video
router.get('/reports/comments', adminController.getCommentReports);
router.post('/reports/comments/:id/dismiss', adminController.dismissCommentReports);
router.get('/reports/users', adminController.getUserReports);
router.post('/reports/users/:id/dismiss', adminController.dismissUserReports);

// ── Comment moderation ─────────────────────────────────────────────────────
router.get('/moderation/status', adminController.getModerationStatus);
router.get('/comments', adminController.getModerationComments);
router.post('/comments/:id/approve', adminController.approveComment);
router.post('/comments/:id/reject', adminController.rejectComment); // body: { reason? }

// ── Audit trail ────────────────────────────────────────────────────────────
router.get('/audit-logs', adminOnly, adminController.getAuditLogs);

module.exports = router;
