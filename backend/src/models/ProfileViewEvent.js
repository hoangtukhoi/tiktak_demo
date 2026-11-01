const mongoose = require('mongoose');

/**
 * ProfileViewEvent — một lượt xem trang cá nhân (không tính chủ tài khoản tự xem).
 * Cùng một người xem chỉ được tính 1 lần mỗi 30 phút (chặn ở controller bằng Redis).
 */
const profileViewEventSchema = new mongoose.Schema(
  {
    profileUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    viewerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }, // null = khách
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

profileViewEventSchema.index({ profileUserId: 1, createdAt: -1 });
profileViewEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 400 * 24 * 3600 });

module.exports = mongoose.model('ProfileViewEvent', profileViewEventSchema);
