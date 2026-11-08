const mongoose = require('mongoose');

/** Lý do báo cáo video (giữ 4 giá trị cũ để dữ liệu cũ vẫn hợp lệ) */
const REPORT_REASONS = [
  'spam',
  'violence',
  'sexual',
  'harassment',
  'hate',
  'dangerous',
  'misinformation',
  'copyright',
  'child_safety',
  'other',
];

/**
 * Report model — tracks user reports on videos.
 * Uniqueness is enforced per (reporterId + videoId) so a user can only
 * report the same video once.
 *
 * status: open → resolved khi admin duyệt (giữ video) hoặc gỡ video.
 */
const reportSchema = new mongoose.Schema(
  {
    videoId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Video',
      required: true,
    },
    reporterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    reason: {
      type: String,
      enum: REPORT_REASONS,
      required: true,
    },
    // Mô tả thêm của người báo cáo (không bắt buộc)
    note: { type: String, trim: true, maxlength: 300, default: '' },
    status: { type: String, enum: ['open', 'resolved'], default: 'open' },
    // Kết quả xử lý: 'kept' (video không vi phạm) | 'removed' (đã gỡ video)
    resolution: { type: String, enum: ['kept', 'removed', null], default: null },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    resolvedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Prevent duplicate reports from the same user on the same video
reportSchema.index({ videoId: 1, reporterId: 1 }, { unique: true });
reportSchema.index({ status: 1, videoId: 1 });

const Report = mongoose.model('Report', reportSchema);
Report.REPORT_REASONS = REPORT_REASONS;

module.exports = Report;
