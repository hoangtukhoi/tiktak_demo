/**
 * User Routes
 *
 * IMPORTANT: Route specificity order matters in Express.
 * Static segments (/search, /me) MUST be registered BEFORE dynamic segments (/:username)
 * to prevent Express from greedily matching "search" or "me" as a username param.
 */

const express = require('express');
const router = express.Router();
const userController = require('../controllers/user.controller');
const analyticsController = require('../controllers/analytics.controller');
const { authenticate, optionalAuth } = require('../middlewares/auth.middleware');
const { imageUpload } = require('../middlewares/upload.middleware');

// ─── Static / authenticated-user routes ──────────────────────────────────────

// GET  /users/search?q=   — search users by username (no auth required)
router.get('/search', userController.searchUsers);

// PATCH /users/me         — update own profile (auth required)
router.patch('/me', authenticate, userController.updateProfile);

// GET /users/me/analytics(/videos/:id) — số liệu phân tích của chính mình
router.get('/me/analytics', authenticate, analyticsController.getMyAnalyticsTab); // = overview
router.get('/me/analytics/videos/:id', authenticate, analyticsController.getMyVideoAnalytics);
router.get('/me/analytics/compare', authenticate, analyticsController.compareMyVideos);
router.get('/me/analytics/:tab(overview|content|viewers|followers)', authenticate, analyticsController.getMyAnalyticsTab);

// POST /users/me/avatar   — upload ảnh đại diện (multipart, trường "avatar")
router.post('/me/avatar', authenticate, imageUpload.single('avatar'), userController.uploadAvatar);

// DELETE /users/me        — delete own account (auth required)
router.delete('/me', authenticate, userController.deleteAccount);

// ─── Dynamic param routes ────────────────────────────────────────────────────

// GET  /users/:username         — get a user's public profile
//   optionalAuth so isFollowing can be calculated when logged in
router.get('/:username', optionalAuth, userController.getProfile);

// GET  /users/:username/videos  — get paginated videos for a user (was /:id/videos)
router.get('/:username/videos', optionalAuth, userController.getUserVideos);

// POST /users/:username/follow  — follow / unfollow a user (auth required)
router.post('/:username/follow', authenticate, userController.followUser);

module.exports = router;