const mongoose = require('mongoose');

const videoSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, trim: true, maxlength: 2000, default: '' },
    hashtags: [{ type: String, lowercase: true }],
    // URLs
    originalUrl: { type: String, default: null },  // file gốc trên S3
    hlsUrl: { type: String, default: null },        // master.m3u8
    thumbnailUrl: { type: String, default: null },
    // Người đăng tự chọn ảnh bìa → bước transcode không tự tạo ảnh bìa đè lên
    customThumbnail: { type: Boolean, default: false },
    // Metadata
    durationMs: { type: Number, default: 0 },
    width: { type: Number, default: 0 },
    height: { type: Number, default: 0 },
    sizeBytes: { type: Number, default: 0 },
    // Trạng thái xử lý
    status: {
      type: String,
      enum: ['uploading', 'processing', 'ready', 'failed', 'deleted'],
      default: 'uploading',
    },
    // Kiểm duyệt
    moderationStatus: {
      type: String,
      enum: ['pending', 'approved', 'removed', 'flagged'],
      default: 'pending',
    },
    flagReason: { type: String, default: null },
    // Lý do admin gỡ video (hiện cho chủ video trong thông báo)
    removeReason: { type: String, default: null, maxlength: 300 },
    // Chủ video đang bị khoá tài khoản → video ẩn với mọi người (đặt lúc khoá / gỡ lúc mở khoá)
    authorBanned: { type: Boolean, default: false },
    reportCount: { type: Number, default: 0 },
    // Tương tác
    viewCount: { type: Number, default: 0 },
    likeCount: { type: Number, default: 0 },
    commentCount: { type: Number, default: 0 },
    shareCount: { type: Number, default: 0 },
    saveCount: { type: Number, default: 0 },
    repostCount: { type: Number, default: 0 },
    // Người được tag trong mô tả video (@username)
    mentions: [
      {
        _id: false,
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        username: String,
      },
    ],
    // Cài đặt
    // Ai được xem: public = mọi người | friends = bạn bè (theo dõi lẫn nhau) | private = chỉ mình tôi.
    // isPrivate được tự đồng bộ = (visibility !== 'public') để mọi truy vấn "công khai" cũ
    // (isPrivate: false) tự loại video bạn bè / riêng tư khỏi feed, tìm kiếm...
    visibility: { type: String, enum: ['public', 'friends', 'private'], default: undefined },
    isPrivate: { type: Boolean, default: false },
    // Bản nháp: chỉ chủ video thấy (tab "Bản nháp" trên hồ sơ)
    isDraft: { type: Boolean, default: false },
    // Hẹn giờ đăng: trước thời điểm này video chỉ chủ video thấy; null = đăng ngay
    scheduledAt: { type: Date, default: null },
    // Đã gửi thông báo tag (@) cho video hẹn giờ lúc tới giờ đăng chưa
    scheduledNotifiedAt: { type: Date, default: null },
    // Tuỳ chọn AI khi tải lên
    sourceLang: { type: String, default: 'vi', maxlength: 10 },
    autoCaption: { type: Boolean, default: false },
    dubLangs: [{ type: String, maxlength: 10 }],
    // Ghim lên đầu hồ sơ (tối đa 3 video / người); null = không ghim
    pinnedAt: { type: Date, default: null },
    allowComment: { type: Boolean, default: true },
    allowDuet: { type: Boolean, default: true },
    // Duet
    duetOfVideoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Video', default: null },
    // Audio tracks đã dịch (tham chiếu sang AudioTrack)
    audioTracks: [{ type: mongoose.Schema.Types.ObjectId, ref: 'AudioTrack' }],
  },
  { timestamps: true }
);

/**
 * Đồng bộ visibility ↔ isPrivate:
 *  - có visibility → isPrivate = visibility !== 'public'
 *  - video cũ chỉ có isPrivate → visibility = private | public
 */
videoSchema.statics.syncVisibility = function syncVisibility(doc) {
  if (doc.visibility) doc.isPrivate = doc.visibility !== 'public';
  else if (typeof doc.isPrivate === 'boolean') doc.visibility = doc.isPrivate ? 'private' : 'public';
  return doc;
};
videoSchema.pre('validate', function syncVisibilityHook(next) {
  if (this.isModified('visibility') || this.isNew) {
    if (!this.visibility) this.visibility = this.isPrivate ? 'private' : 'public';
    this.isPrivate = this.visibility !== 'public';
  } else if (this.isModified('isPrivate')) {
    this.visibility = this.isPrivate ? 'private' : 'public';
  }
  next();
});

// Index tìm kiếm
videoSchema.index({ title: 'text', description: 'text', hashtags: 'text' });
videoSchema.index({ userId: 1 });
videoSchema.index({ userId: 1, pinnedAt: -1, _id: -1 });
videoSchema.index({ status: 1, isPrivate: 1, createdAt: -1 });
videoSchema.index({ hashtags: 1 });

module.exports = mongoose.model('Video', videoSchema);
