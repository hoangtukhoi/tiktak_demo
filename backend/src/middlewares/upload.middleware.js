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

/**
 * Form tải video kèm ảnh bìa tự chọn: trường "video" (bắt buộc) + "thumbnail" (ảnh, không bắt buộc).
 * Ảnh bìa tối đa 5 MB (kiểm tra ở controller vì multer chỉ có 1 giới hạn chung).
 */
exports.videoWithCoverUpload = multer({
  storage,
  limits: { fileSize: MAX_VIDEO_SIZE_MB * 1024 * 1024, files: 2 },
  fileFilter: (req, file, cb) => {
    if (file.fieldname === 'video' && file.mimetype.startsWith('video/')) return cb(null, true);
    if (file.fieldname === 'thumbnail' && file.mimetype.startsWith('image/')) return cb(null, true);
    const msg = file.fieldname === 'thumbnail' ? 'Ảnh bìa phải là file ảnh' : 'Chỉ chấp nhận file video';
    return cb(Object.assign(new Error(msg), { statusCode: 400 }), false);
  },
}).fields([{ name: 'video', maxCount: 1 }, { name: 'thumbnail', maxCount: 1 }]);
