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
    // Metadata
    durationMs: { type: Number, default: 0 },
    width: { type: Number, default: 0 },
    height: { type: Number, default: 0 },
    sizeBytes: { type: Number, default: 0 },
    // Trạng thái xử lý
    status: {
      type: String,
      enum: ['uploading', 'processing', 'ready', 'failed'],
      default: 'uploading',
    },
    // Kiểm duyệt
    moderationStatus: {
      type: String,
      enum: ['pending', 'approved', 'removed', 'flagged'],
      default: 'pending',
    },
    flagReason: { type: String, default: null },
    reportCount: { type: Number, default: 0 },
    // Tương tác
    viewCount: { type: Number, default: 0 },
    likeCount: { type: Number, default: 0 },
    commentCount: { type: Number, default: 0 },
    shareCount: { type: Number, default: 0 },
    // Cài đặt
    isPrivate: { type: Boolean, default: false },
    allowComment: { type: Boolean, default: true },
    allowDuet: { type: Boolean, default: true },
    // Duet
    duetOfVideoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Video', default: null },
    // Audio tracks đã dịch (tham chiếu sang AudioTrack)
    audioTracks: [{ type: mongoose.Schema.Types.ObjectId, ref: 'AudioTrack' }],
  },
  { timestamps: true }
);

// Index tìm kiếm
videoSchema.index({ title: 'text', description: 'text', hashtags: 'text' });
videoSchema.index({ userId: 1 });
videoSchema.index({ status: 1, isPrivate: 1, createdAt: -1 });
videoSchema.index({ hashtags: 1 });

module.exports = mongoose.model('Video', videoSchema);
