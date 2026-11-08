const mongoose = require('mongoose');

/**
 * Đăng lại (repost) kiểu TikTok: chia sẻ lại video của người khác cho người theo dõi mình.
 * Video đăng lại xuất hiện trong tab "Đăng lại" trên hồ sơ và trong feed "Đang theo dõi"
 * của người theo dõi, kèm dòng "@x đã đăng lại".
 */
const repostSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    videoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Video', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

repostSchema.index({ userId: 1, videoId: 1 }, { unique: true });
repostSchema.index({ userId: 1, _id: -1 });
repostSchema.index({ videoId: 1, userId: 1 });

module.exports = mongoose.model('Repost', repostSchema);
