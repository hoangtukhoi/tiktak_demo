const express = require('express');
const router = express.Router();
const dubbingController = require('../controllers/dubbing.controller');
const { authenticate, optionalAuth } = require('../middlewares/auth.middleware');
router.post('/request', authenticate, dubbingController.requestDubbing);
router.get('/languages', dubbingController.getSupportedLanguages);
router.get('/health', dubbingController.getAiHealth);
// optionalAuth: bản lồng tiếng của video riêng tư / bạn bè chỉ người xem được video mới lấy được
router.get('/:trackId/status', optionalAuth, dubbingController.getDubbingStatus);
router.get('/video/:videoId', optionalAuth, dubbingController.getVideoTracks);
module.exports = router;
