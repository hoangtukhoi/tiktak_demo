const mongoose = require('mongoose');

/** blockerId đã chặn blockedId. Chặn có hiệu lực 2 chiều (xem privacy.service.js). */
const blockSchema = new mongoose.Schema(
  {
    blockerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    blockedId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

blockSchema.index({ blockerId: 1, blockedId: 1 }, { unique: true });
blockSchema.index({ blockedId: 1 });

module.exports = mongoose.model('Block', blockSchema);
