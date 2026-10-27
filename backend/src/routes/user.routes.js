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
const { authenticate, optionalAuth } = require('../middlewares/auth.middleware');

// ─── Static / authenticated-user routes ──────────────────────────────────────

// GET  /users/search?q=   — search users by username (no auth required)
router.get('/search', userController.searchUsers);

// PATCH /users/me         — update own profile (auth required)
router.patch('/me', authenticate, userController.updateProfile);

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