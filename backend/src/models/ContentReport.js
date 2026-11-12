const mongoose = require('mongoose');
const { REPORT_REASONS } = require('./Report');

/** Lý do báo cáo bình luận / tài khoản: như video + mạo danh (chỉ có nghĩa với tài khoản) */
const CONTENT_REPORT_REASONS = [...REPORT_REASONS, 'impersonation'];

/**
 * Báo cáo bình luận và tài khoản (báo cáo video vẫn ở model Report).
 * Mỗi người chỉ báo cáo 1 lần cho 1 bình luận / 1 tài khoản.
 *
 * status: open → resolved khi admin / kiểm duyệt viên xử lý.
 * resolution: dismissed (không vi phạm) | hidden (đã ẩn bình luận) | banned (đã khoá tài khoản)
 */
const contentReportSchema = new mongoose.Schema(
  {
    targetType: { type: String, enum: ['comment', 'user'], required: true },
    // _id của bình luận hoặc tài khoản bị báo cáo
    targetId: { type: mongoose.Schema.Types.ObjectId, required: true },
    // Chủ của nội dung bị báo cáo (người viết bình luận / chính tài khoản đó)
    targetUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // Video chứa bình luận (để admin mở xem ngữ cảnh)
    videoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Video', default: null },
    reporterId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    reason: { type: String, enum: CONTENT_REPORT_REASONS, required: true },
    note: { type: String, trim: true, maxlength: 300, default: '' },
    status: { type: String, enum: ['open', 'resolved'], default: 'open' },
    resolution: { type: String, enum: ['dismissed', 'hidden', 'banned', null], default: null },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    resolvedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

contentReportSchema.index({ targetType: 1, targetId: 1, reporterId: 1 }, { unique: true });
contentReportSchema.index({ targetType: 1, status: 1, targetId: 1 });

const ContentReport = mongoose.model('ContentReport', contentReportSchema);
ContentReport.CONTENT_REPORT_REASONS = CONTENT_REPORT_REASONS;

module.exports = ContentReport;
