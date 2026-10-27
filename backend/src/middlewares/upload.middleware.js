const multer = require('multer');
const { MAX_VIDEO_SIZE_MB } = require('../utils/constants');
const storage = multer.memoryStorage();
exports.videoUpload = multer({
  storage,
  limits: { fileSize: MAX_VIDEO_SIZE_MB * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('video/')) cb(null, true);
    else cb(Object.assign(new Error('Chỉ chấp nhận file video'), { statusCode: 400 }), false);
  }
});
exports.imageUpload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(Object.assign(new Error('Chỉ chấp nhận file ảnh'), { statusCode: 400 }), false);
  }
});