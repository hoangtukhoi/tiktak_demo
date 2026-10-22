const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin.controller');
const { authenticate, requireRole } = require('../middlewares/auth.middleware');

// All admin routes require a valid JWT and the 'admin' role
router.use(authenticate, requireRole('admin'));

// ── Dashboard ──────────────────────────────────────────────────────────────
router.get('/stats', adminController.getStats);

// ── User management ────────────────────────────────────────────────────────
router.get('/users', adminController.getUsers);
router.post('/users/:id/ban', adminController.banUser);
router.post('/users/:id/unban', adminController.unbanUser);
router.post('/users/:id/verify', adminController.verifyUser);

// ── Video management ───────────────────────────────────────────────────────
// IMPORTANT: static segment '/videos/flagged' MUST be registered before the
// parameterised '/videos/:id' routes.  Express matches routes in registration
// order; placing /flagged after /:id would cause Express to treat "flagged"
// as a value for the :id parameter, silently bypassing the intended handler.
router.get('/videos/flagged', adminController.getFlaggedVideos);
router.get('/videos', adminController.getVideos);
router.delete('/videos/:id', adminController.removeVideo);
router.post('/videos/:id/approve', adminController.approveVideo);

// ── Audit trail ────────────────────────────────────────────────────────────
router.get('/audit-logs', adminController.getAuditLogs);

module.exports = router;