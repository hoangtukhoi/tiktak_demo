const express = require('express');

const router = express.Router();
const uploadController = require('../controllers/upload.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { videoUpload } = require('../middlewares/upload.middleware');
const { uploadLimiter } = require('../middlewares/rateLimit.middleware');

// Upload video trực tiếp (multipart/form-data)
router.post('/', authenticate, uploadLimiter, videoUpload.single('video'), uploadController.uploadVideo);

// Lấy presigned URL upload S3 trực tiếp
router.post('/presign', authenticate, uploadLimiter, uploadController.createPresignedUpload);

// Theo dõi tiến trình transcode qua SSE
router.get('/:jobId/progress', uploadController.streamProgress);

module.exports = router;
