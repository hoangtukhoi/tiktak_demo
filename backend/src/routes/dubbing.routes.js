const express = require('express');
const router = express.Router();
const dubbingController = require('../controllers/dubbing.controller');
const { authenticate } = require('../middlewares/auth.middleware');
router.post('/request', authenticate, dubbingController.requestDubbing);
router.get('/languages', dubbingController.getSupportedLanguages);
router.get('/:trackId/status', dubbingController.getDubbingStatus);
router.get('/video/:videoId', dubbingController.getVideoTracks);
module.exports = router;