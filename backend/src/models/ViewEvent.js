const mongoose = require('mongoose');

/**
 * ViewEvent — một lượt xem video, ghi khi người xem rời khỏi video.
 * Dùng cho trang phân tích: lượt xem theo ngày, thời gian xem, tỷ lệ xem hết,
 * đường giữ chân người xem, nguồn lượt xem, giờ người xem hoạt động.
 * Tự xoá sau 400 ngày (TTL) — đủ cho khoảng phân tích 365 ngày.
 */
const viewEventSchema = new mongoose.Schema(
  {
    videoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Video', required: true },
    creatorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // chủ video
    viewerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }, // null = khách
    watchTimeMs: { type: Number, min: 0, default: 0 },
    videoDurationMs: { type: Number, min: 0, default: 0 },
    watchedRatio: { type: Number, min: 0, max: 1, default: 0 }, // 0..1, đã xem bao nhiêu % video
    completed: { type: Boolean, default: false }, // xem hết (≥ 90% hoặc đã lặp lại)
    source: {
      type: String,
      enum: ['for_you', 'following', 'profile', 'search', 'direct', 'other'],
      default: 'other',
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

viewEventSchema.index({ creatorId: 1, createdAt: -1 });
viewEventSchema.index({ videoId: 1, createdAt: -1 });
viewEventSchema.index({ createdAt: -1 });
const TTL_SECONDS = 400 * 24 * 3600;
viewEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: TTL_SECONDS });

const ViewEvent = mongoose.model('ViewEvent', viewEventSchema);

// Database tạo từ bản cũ (TTL 180 ngày): MongoDB không tự đổi option của index đã có,
// nên cập nhật bằng collMod khi kết nối. Lỗi (VD collection chưa tồn tại) thì bỏ qua.
mongoose.connection.once('open', () => {
  mongoose.connection.db
    .command({ collMod: ViewEvent.collection.collectionName, index: { keyPattern: { createdAt: 1 }, expireAfterSeconds: TTL_SECONDS } })
    .catch(() => {});
});

module.exports = ViewEvent;
