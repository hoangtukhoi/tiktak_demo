const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // người nhận
    type: {
      type: String,
      enum: ['new_like', 'new_comment', 'new_follower', 'video_ready', 'dubbing_done', 'mention'],
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
    },
    isRead: { type: Boolean, default: false },
  },
  { timestamps: true }
);

notificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
