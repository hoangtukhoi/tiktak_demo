const mongoose = require('mongoose');

/** Video người dùng đã lưu (bookmark kiểu TikTok). Chỉ chủ tài khoản xem được danh sách. */
const savedVideoSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    videoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Video', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

savedVideoSchema.index({ userId: 1, videoId: 1 }, { unique: true });
savedVideoSchema.index({ userId: 1, _id: -1 });
savedVideoSchema.index({ videoId: 1 });

module.exports = mongoose.model('SavedVideo', savedVideoSchema);
