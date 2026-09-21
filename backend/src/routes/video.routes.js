const express = require('express');

const router = express.Router();
const videoController = require('../controllers/video.controller');
const { authenticate, optionalAuth } = require('../middlewares/auth.middleware');
const validate = require('../middlewares/validate.middleware');
const { createVideoSchema, updateVideoSchema } = require('../validators/video.validator');

router.get('/search', videoController.searchVideos);
router.get('/hashtags/trending', videoController.getTrendingHashtags);
router.get('/hashtags/:tag', videoController.getVideosByHashtag);

router.post('/', authenticate, validate(createVideoSchema), videoController.createVideo);
router.get('/:id', optionalAuth, videoController.getVideo);
router.patch('/:id', authenticate, validate(updateVideoSchema), videoController.updateVideo);
router.delete('/:id', authenticate, videoController.deleteVideo);
router.post('/:id/like', authenticate, videoController.likeVideo);
router.post('/:id/view', optionalAuth, videoController.recordView);
router.post('/:id/report', authenticate, videoController.reportVideo);

module.exports = router;
