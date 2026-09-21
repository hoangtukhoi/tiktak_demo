const mongoose = require('mongoose');

/**
 * Nhật ký thao tác của admin/moderator.
 * Mỗi hành động kiểm duyệt đều ghi lại để truy vết về sau.
 */
const auditLogSchema = new mongoose.Schema(
  {
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    actorUsername: { type: String },
    action: {
      type: String,
      required: true,
      enum: [
        'user.ban',
        'user.unban',
        'user.verify',
        'video.approve',
        'video.remove',
        'video.flag',
        'report.resolve',
      ],
    },
    targetType: { type: String, enum: ['user', 'video', 'report'], required: true },
    targetId: { type: mongoose.Schema.Types.ObjectId, required: true },
    reason: { type: String, default: null },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ targetType: 1, targetId: 1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
