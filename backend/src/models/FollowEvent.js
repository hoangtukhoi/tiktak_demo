const mongoose = require('mongoose');

/**
 * FollowEvent — lịch sử follow/unfollow. Bảng Follow chỉ giữ trạng thái hiện tại
 * (unfollow là xoá bản ghi), nên cần bảng này để vẽ biểu đồ tăng trưởng follower.
 */
const followEventSchema = new mongoose.Schema(
  {
    followerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    followingId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // người được follow
    action: { type: String, enum: ['follow', 'unfollow'], required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

followEventSchema.index({ followingId: 1, createdAt: -1 });

module.exports = mongoose.model('FollowEvent', followEventSchema);
