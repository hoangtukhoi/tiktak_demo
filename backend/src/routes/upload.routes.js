const express = require('express');

const router = express.Router();
const uploadController = require('../controllers/upload.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { videoUpload } = require('../middlewares/upload.middleware');
const { uploadLimiter } = require('../middlewares/rateLimit.middleware');

router.post('/', authenticate, uploadLimiter, videoUpload.single('video'), uploadController.uploadVideo);
router.post('/presign', authenticate, uploadLimiter, uploadController.createPresignedUpload);
router.get('/:jobId/progress', uploadController.streamProgress);

module.exports = router;
