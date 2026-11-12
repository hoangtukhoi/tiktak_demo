const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // người nhận
    type: {
      type: String,
      // moderation: admin / kiểm duyệt viên đã xử lý nội dung của bạn (xem payload.context)
      enum: ['new_like', 'new_comment', 'new_follower', 'video_ready', 'dubbing_done', 'mention', 'repost', 'moderation'],
      required: true,
    },
    payload: {
      actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      actorUsername: String,
      actorAvatar: String,
      videoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Video' },
      videoThumbnail: String,
      commentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Comment' },
      message: String,
      // Ngữ cảnh: 'comment' | 'reply' | 'video' (dùng để hiển thị câu thông báo phù hợp)
      // Với type 'moderation': video_removed | video_restored | comment_hidden | comment_restored
      context: String,
      // Lý do do người kiểm duyệt ghi (type 'moderation')
      reason: String,
      // Trích nội dung liên quan (tiêu đề video / bình luận) để người nhận biết đang nói về cái gì
      excerpt: String,
    },
    isRead: { type: Boolean, default: false },
  },
  { timestamps: true }
);

notificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
