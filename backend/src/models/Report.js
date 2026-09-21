const mongoose = require('mongoose');

/** Báo cáo vi phạm do người dùng gửi lên, đầu vào cho hàng đợi kiểm duyệt. */
const reportSchema = new mongoose.Schema(
  {
    videoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Video', required: true },
    reporterId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    reason: {
      type: String,
      required: true,
      enum: ['spam', 'violence', 'nudity', 'hate_speech', 'misinformation', 'copyright', 'other'],
    },
    description: { type: String, maxlength: 500, default: '' },
    status: { type: String, enum: ['open', 'resolved', 'rejected'], default: 'open' },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    resolvedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

reportSchema.index({ videoId: 1, reporterId: 1 }, { unique: true });
reportSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Report', reportSchema);
