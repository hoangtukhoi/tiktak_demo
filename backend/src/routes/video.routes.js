const express = require('express');
const router = express.Router();
const videoController = require('../controllers/video.controller');
const { authenticate, optionalAuth, requireInternalKey } = require('../middlewares/auth.middleware');
const { viewLimiter, reactionLimiter, reportLimiter } = require('../middlewares/rateLimit.middleware');

// ─── Static / non-parameterised routes (must appear before /:id) ──────────────

// Full-text search
router.get('/search', optionalAuth, videoController.searchVideos); // optionalAuth: cờ thích/lưu + ẩn người đã chặn

// Trending hashtags aggregated from recent videos
// IMPORTANT: this must be declared before /:id so Express doesn't treat
// "hashtags" as a video ID.
router.get('/hashtags/trending', videoController.getTrendingHashtags);

// ─── Collection routes ────────────────────────────────────────────────────────

// Create — handled by the upload pipeline; stub returns 501
router.post('/', authenticate, videoController.createVideo);

// ─── Single-resource routes ───────────────────────────────────────────────────

router.get('/:id', optionalAuth, videoController.getVideo);
router.patch('/:id', authenticate, videoController.updateVideo);
router.delete('/:id', authenticate, videoController.deleteVideo);

// ─── Engagement sub-routes ────────────────────────────────────────────────────

router.post('/:id/like', authenticate, reactionLimiter, videoController.likeVideo);
router.post('/:id/view', viewLimiter, optionalAuth, videoController.recordView);
router.post('/:id/share', viewLimiter, optionalAuth, videoController.shareVideo);

// Ghim / bỏ ghim video lên đầu hồ sơ
router.post('/:id/pin', authenticate, reactionLimiter, videoController.togglePin);

// Đăng lại / bỏ đăng lại video
router.post('/:id/repost', authenticate, reactionLimiter, videoController.toggleRepost);

// Lưu / bỏ lưu video (bookmark)
router.post('/:id/save', authenticate, reactionLimiter, videoController.toggleSave);

// Report a video (authenticated; one report per user per video)
router.post('/:id/report', authenticate, reportLimiter, videoController.reportVideo);

// ─── Internal / pipeline callback ────────────────────────────────────────────

// Called by the transcoding pipeline after HLS encoding completes
// Yêu cầu header x-internal-key = INTERNAL_KEY
router.patch('/:id/urls', requireInternalKey, videoController.updateVideoUrls);

module.exports = router;
