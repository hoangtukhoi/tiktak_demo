const mongoose = require('mongoose');
const { VIDEO_STATUSES, MODERATION_STATUSES } = require('../utils/constants');

const videoSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, trim: true, maxlength: 2000, default: '' },
    hashtags: [{ type: String, lowercase: true, trim: true }],

    // Khoá object trên S3 của file gốc, giữ lại để worker tải về xử lý.
    originalKey: { type: String, default: null },
    originalUrl: { type: String, default: null },
    hlsUrl: { type: String, default: null }, // master.m3u8
    thumbnailUrl: { type: String, default: null },
    availableQualities: [{ type: String }],

    durationMs: { type: Number, default: 0 },
    width: { type: Number, default: 0 },
    height: { type: Number, default: 0 },
    sizeBytes: { type: Number, default: 0 },
    hasAudio: { type: Boolean, default: true },

    // Ngôn ngữ gốc của lời thoại, dùng làm sourceLang mặc định khi lồng tiếng.
    originalLang: { type: String, default: null },

    status: { type: String, enum: VIDEO_STATUSES, default: 'uploading' },
    processingError: { type: String, default: null },
    transcodeJobId: { type: String, default: null },

    moderationStatus: { type: String, enum: MODERATION_STATUSES, default: 'pending' },
    flagReason: { type: String, default: null },
    reportCount: { type: Number, default: 0 },

    viewCount: { type: Number, default: 0 },
    likeCount: { type: Number, default: 0 },
    commentCount: { type: Number, default: 0 },
    shareCount: { type: Number, default: 0 },
    totalWatchTimeMs: { type: Number, default: 0 },

    isPrivate: { type: Boolean, default: false },
    allowComment: { type: Boolean, default: true },
    allowDuet: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false },

    duetOfVideoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Video', default: null },
    audioTracks: [{ type: mongoose.Schema.Types.ObjectId, ref: 'AudioTrack' }],
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

videoSchema.index({ title: 'text', description: 'text', hashtags: 'text' });
videoSchema.index({ userId: 1, createdAt: -1 });
videoSchema.index({ status: 1, isPrivate: 1, isDeleted: 1, createdAt: -1 });
videoSchema.index({ hashtags: 1 });
videoSchema.index({ moderationStatus: 1, reportCount: -1 });

/** Điều kiện chuẩn để một video được xuất hiện công khai. */
videoSchema.statics.publicFilter = function publicFilter(extra = {}) {
  return {
    status: 'ready',
    isPrivate: false,
    isDeleted: false,
    moderationStatus: { $ne: 'removed' },
    ...extra,
  };
};

module.exports = mongoose.model('Video', videoSchema);
