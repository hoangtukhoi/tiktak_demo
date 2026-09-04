const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema(
  {
    videoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Video', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Comment', default: null },
    content: { type: String, required: true, trim: true, maxlength: 500 },
    likeCount: { type: Number, default: 0 },
    replyCount: { type: Number, default: 0 },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

commentSchema.index({ videoId: 1, parentId: 1, createdAt: -1 });
commentSchema.index({ userId: 1 });

module.exports = mongoose.model('Comment', commentSchema);
