const multer = require('multer');
const { MAX_VIDEO_SIZE_MB, MAX_IMAGE_SIZE_MB } = require('../utils/constants');

const ALLOWED_VIDEO_MIME = ['video/mp4', 'video/webm', 'video/quicktime'];
const ALLOWED_IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp'];

const storage = multer.memoryStorage();

const videoUpload = multer({
  storage,
  limits: { fileSize: MAX_VIDEO_SIZE_MB * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_VIDEO_MIME.includes(file.mimetype)) return cb(null, true);
    cb(Object.assign(new Error('Chỉ chấp nhận video MP4, WebM hoặc MOV'), { statusCode: 400 }));
  },
});

const imageUpload = multer({
  storage,
  limits: { fileSize: MAX_IMAGE_SIZE_MB * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_IMAGE_MIME.includes(file.mimetype)) return cb(null, true);
    cb(Object.assign(new Error('Chỉ chấp nhận ảnh JPEG, PNG hoặc WebP'), { statusCode: 400 }));
  },
});

module.exports = { videoUpload, imageUpload, ALLOWED_VIDEO_MIME, ALLOWED_IMAGE_MIME };
