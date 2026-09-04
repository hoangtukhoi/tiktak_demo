const mongoose = require('mongoose');

const likeSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    targetId: { type: mongoose.Schema.Types.ObjectId, required: true }, // videoId hoặc commentId
    targetType: { type: String, enum: ['video', 'comment'], required: true },
  },
  { timestamps: true }
);

likeSchema.index({ userId: 1, targetId: 1, targetType: 1 }, { unique: true });

module.exports = mongoose.model('Like', likeSchema);
