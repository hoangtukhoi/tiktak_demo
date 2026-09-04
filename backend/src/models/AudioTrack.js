const mongoose = require('mongoose');

/**
 * AudioTrack — bản lồng tiếng đã được AI dịch theo từng ngôn ngữ
 * Một video có thể có nhiều AudioTrack (mỗi ngôn ngữ = 1 track)
 */
const audioTrackSchema = new mongoose.Schema(
  {
    videoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Video', required: true },
    sourceLang: { type: String, required: true }, // ngôn ngữ gốc, VD: 'vi'
    targetLang: { type: String, required: true }, // ngôn ngữ đích, VD: 'en'
    // Kết quả từng bước pipeline
    transcript: { type: String, default: null },       // STT output
    translatedText: { type: String, default: null },   // dịch thuật output
    audioUrl: { type: String, default: null },          // TTS audio S3 URL
    lipSyncedVideoUrl: { type: String, default: null }, // Wav2Lip output (optional)
    // Subtitle file URL (SRT/VTT)
    subtitleUrl: { type: String, default: null },
    // Trạng thái
    status: {
      type: String,
      enum: ['pending', 'transcribing', 'translating', 'synthesizing', 'done', 'failed'],
      default: 'pending',
    },
    error: { type: String, default: null },
    jobId: { type: String, default: null }, // BullMQ job ID để track progress
    modelVersion: { type: String, default: 'whisper-large-v3 + seamless-m4t-v2' },
  },
  { timestamps: true }
);

audioTrackSchema.index({ videoId: 1, targetLang: 1 }, { unique: true });

module.exports = mongoose.model('AudioTrack', audioTrackSchema);
