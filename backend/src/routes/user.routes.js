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
const { followLimiter, reportLimiter } = require('../middlewares/rateLimit.middleware');
const { imageUpload } = require('../middlewares/upload.middleware');
const { authLimiter } = require('../middlewares/rateLimit.middleware');

// ─── Static / authenticated-user routes ──────────────────────────────────────

// GET  /users/search?q=   — search users by username (no auth required)
router.get('/search', optionalAuth, userController.searchUsers); // optionalAuth: ẩn người đã chặn nhau

// GET /users/mention-suggest?q= — gợi ý người để tag (@)
router.get('/mention-suggest', optionalAuth, userController.mentionSuggest);

// GET /users/me/saved      — video đã lưu (chỉ chủ tài khoản)
router.get('/me/saved', authenticate, userController.getSavedVideos);

// GET /users/me/drafts     — bản nháp (chỉ chủ tài khoản)
router.get('/me/drafts', authenticate, userController.getDrafts);

// GET /users/me/liked      — video đã thả tim (chỉ chủ tài khoản)
router.get('/me/liked', authenticate, userController.getLikedVideos);

// Quyền riêng tư & chặn
router.get('/me/privacy', authenticate, userController.getPrivacy);
router.patch('/me/privacy', authenticate, userController.updatePrivacy);
router.get('/me/blocked', authenticate, userController.getBlockedUsers);
router.delete('/me/followers/:userId', authenticate, userController.removeFollower);

// PATCH /users/me         — update own profile (auth required)
router.patch('/me', authenticate, userController.updateProfile);
// PATCH /users/me/change-password — đổi mật khẩu (giới hạn tần suất như đăng nhập, chống dò mật khẩu)
router.patch('/me/change-password', authenticate, authLimiter, userController.changePassword);
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

// GET  /users/:username/followers | following | liked — theo cài đặt quyền riêng tư của người đó
router.get('/:username/followers', optionalAuth, userController.getFollowers);
router.get('/:username/following', optionalAuth, userController.getFollowing);
router.get('/:username/liked', optionalAuth, userController.getUserLiked);

// POST / DELETE /users/:username/block — chặn / bỏ chặn
router.post('/:username/block', authenticate, followLimiter, userController.blockUser);
router.delete('/:username/block', authenticate, userController.unblockUser);

// GET  /users/:username/reposts — video người này đã đăng lại
router.get('/:username/reposts', optionalAuth, userController.getUserReposts);

// POST / DELETE /users/:id/follow — theo dõi / bỏ theo dõi (id hoặc username)
// POST /users/:username/report — báo cáo tài khoản vi phạm (mỗi người 1 lần / tài khoản)
router.post('/:username/report', authenticate, reportLimiter, userController.reportUser);

router.post('/:username/follow', authenticate, followLimiter, userController.followUser);
router.delete('/:username/follow', authenticate, followLimiter, userController.unfollowUser);

module.exports = router;
