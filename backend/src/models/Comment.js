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

    // Người được tag (@username) — lưu lại để hiện link và gửi thông báo khi bình luận được duyệt
    mentions: [
      {
        _id: false,
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        username: String,
      },
    ],

    // ── Kiểm duyệt ──────────────────────────────────────────────────────
    // approved: hiện công khai | pending: chờ admin duyệt (chỉ tác giả thấy)
    // rejected: bị ẩn (chỉ tác giả thấy, kèm nhãn "bị ẩn")
    // Bình luận cũ không có trường này được coi là approved.
    moderationStatus: {
      type: String,
      enum: ['approved', 'pending', 'rejected'],
      default: 'approved',
    },
    moderation: {
      // Điểm vi phạm 0–1 (xác suất KHÔNG sạch) do model/bộ lọc chấm
      score: { type: Number, default: null },
      label: { type: String, default: null },
      // model | keyword | admin | none
      source: { type: String, default: null },
      reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      reviewedAt: { type: Date, default: null },
    },
  },
  { timestamps: true }
);

commentSchema.index({ videoId: 1, parentId: 1, createdAt: -1 });
commentSchema.index({ userId: 1 });
commentSchema.index({ moderationStatus: 1, _id: -1 });

/** Điều kiện "được hiện công khai" (bình luận cũ không có trường moderationStatus vẫn hiện) */
commentSchema.statics.PUBLIC_FILTER = { moderationStatus: { $nin: ['pending', 'rejected'] } };

module.exports = mongoose.model('Comment', commentSchema);
