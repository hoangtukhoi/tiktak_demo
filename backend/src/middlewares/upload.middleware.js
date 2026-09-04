const multer = require('multer');
const { MAX_VIDEO_SIZE_MB } = require('../utils/constants');
const storage = multer.memoryStorage();
exports.videoUpload = multer({
  storage,
  limits: { fileSize: MAX_VIDEO_SIZE_MB * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('video/')) cb(null, true);
    else cb(new Error('Chỉ chấp nhận video'), false);
  }
});
exports.imageUpload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Chỉ chấp nhận image'), false);
  }
});