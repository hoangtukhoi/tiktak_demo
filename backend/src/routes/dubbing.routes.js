const express = require('express');

const router = express.Router();
const dubbingController = require('../controllers/dubbing.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { dubbingLimiter } = require('../middlewares/rateLimit.middleware');
const validate = require('../middlewares/validate.middleware');
const { requestDubbingSchema } = require('../validators/video.validator');

router.get('/languages', dubbingController.getSupportedLanguages);
router.get('/health', dubbingController.getServiceHealth);
router.get('/video/:videoId', dubbingController.getVideoTracks);
router.get('/:trackId/status', dubbingController.getDubbingStatus);

router.post(
  '/request',
  authenticate,
  dubbingLimiter,
  validate(requestDubbingSchema),
  dubbingController.requestDubbing
);
router.delete('/:trackId', authenticate, dubbingController.deleteTrack);

module.exports = router;
