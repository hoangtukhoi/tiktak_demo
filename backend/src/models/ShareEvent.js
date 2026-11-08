const mongoose = require('mongoose');

/** ShareEvent — một lượt chia sẻ video (qua mạng xã hội, chia sẻ của hệ thống hoặc sao chép link). */
const SHARE_METHODS = ['native', 'copy_link', 'facebook', 'messenger', 'zalo', 'x', 'telegram', 'whatsapp', 'email', 'other'];

const shareEventSchema = new mongoose.Schema(
  {
    videoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Video', required: true },
    creatorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    method: { type: String, enum: SHARE_METHODS, default: 'other' },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

shareEventSchema.index({ creatorId: 1, createdAt: -1 });
shareEventSchema.index({ videoId: 1, createdAt: -1 });
shareEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 400 * 24 * 3600 });

module.exports = mongoose.model('ShareEvent', shareEventSchema);
module.exports.SHARE_METHODS = SHARE_METHODS;
