const express = require('express');
const router = express.Router();
const videoController = require('../controllers/video.controller');
const { authenticate, optionalAuth, requireInternalKey } = require('../middlewares/auth.middleware');
const { viewLimiter } = require('../middlewares/rateLimit.middleware');

// ─── Static / non-parameterised routes (must appear before /:id) ──────────────

// Full-text search
router.get('/search', videoController.searchVideos);

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

router.post('/:id/like', authenticate, videoController.likeVideo);
router.post('/:id/view', viewLimiter, videoController.recordView);

// Report a video (authenticated; one report per user per video)
router.post('/:id/report', authenticate, videoController.reportVideo);

// ─── Internal / pipeline callback ────────────────────────────────────────────

// Called by the transcoding pipeline after HLS encoding completes
// Yêu cầu header x-internal-key = INTERNAL_KEY
router.patch('/:id/urls', requireInternalKey, videoController.updateVideoUrls);

module.exports = router;