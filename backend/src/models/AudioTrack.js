const mongoose = require('mongoose');
const { DUBBING_STATUSES } = require('../utils/constants');

/** Một đoạn lời thoại kèm mốc thời gian, dùng chung cho transcript và bản dịch. */
const segmentSchema = new mongoose.Schema(
  {
    start: { type: Number, required: true }, // giây
    end: { type: Number, required: true },
    text: { type: String, default: '' },
    translatedText: { type: String, default: '' },
  },
  { _id: false }
);

/**
 * AudioTrack - bản lồng tiếng của một video sang một ngôn ngữ.
 * Mỗi cặp (videoId, targetLang) chỉ tồn tại một bản ghi, dùng lại khi có người khác yêu cầu.
 */
const audioTrackSchema = new mongoose.Schema(
  {
    videoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Video', required: true },
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    sourceLang: { type: String, required: true },
    targetLang: { type: String, required: true },
    detectedLang: { type: String, default: null },

    transcript: { type: String, default: null },
    translatedText: { type: String, default: null },
    segments: { type: [segmentSchema], default: [] },

    audioUrl: { type: String, default: null }, // file TTS trên S3
    dubbedVideoUrl: { type: String, default: null }, // video đã ghép audio mới
    subtitleUrl: { type: String, default: null }, // file VTT ngôn ngữ đích
    lipSyncedVideoUrl: { type: String, default: null },

    status: { type: String, enum: DUBBING_STATUSES, default: 'pending' },
    progress: { type: Number, default: 0, min: 0, max: 100 },
    statusMessage: { type: String, default: null },
    error: { type: String, default: null },
    jobId: { type: String, default: null },

    durationMs: { type: Number, default: 0 },
    processingMs: { type: Number, default: 0 },
    modelVersion: { type: String, default: null },
  },
  { timestamps: true }
);

audioTrackSchema.index({ videoId: 1, targetLang: 1 }, { unique: true });
audioTrackSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('AudioTrack', audioTrackSchema);
