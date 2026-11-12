const express = require('express');

const router = express.Router();
const uploadController = require('../controllers/upload.controller');
const { authenticate, authenticateSse } = require('../middlewares/auth.middleware');
const { videoWithCoverUpload } = require('../middlewares/upload.middleware');
const { uploadLimiter } = require('../middlewares/rateLimit.middleware');

// Upload video trực tiếp (multipart/form-data): trường "video" + ảnh bìa "thumbnail" (không bắt buộc)
router.post('/', authenticate, uploadLimiter, videoWithCoverUpload, uploadController.uploadVideo);

// Lấy presigned URL upload S3 trực tiếp
router.post('/presign', authenticate, uploadLimiter, uploadController.createPresignedUpload);

// Theo dõi tiến trình transcode qua SSE
// (EventSource không gửi được header nên token đi qua ?token=)
router.get('/:jobId/progress', authenticateSse, uploadController.streamProgress);

module.exports = router;
