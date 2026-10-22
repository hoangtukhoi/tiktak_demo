const mongoose = require('mongoose');

/**
 * AuditLog — records every administrative action taken by an admin/moderator.
 * Used for accountability, rollback investigation, and compliance audits.
 */
const auditLogSchema = new mongoose.Schema(
  {
    /** The admin/moderator who performed the action */
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    /**
     * The type of action performed.
     * Keeping a strict enum prevents free-form strings from polluting the log.
     */
    action: {
      type: String,
      required: true,
      enum: [
        'ban_user',
        'unban_user',
        'verify_user',
        'remove_video',
        'approve_video',
        'flag_video',
      ],
      index: true,
    },

    /** What kind of entity was acted upon */
    targetType: {
      type: String,
      enum: ['user', 'video', 'comment'],
    },

    /** The _id of the entity that was acted upon */
    targetId: {
      type: mongoose.Schema.Types.ObjectId,
    },

    /**
     * Arbitrary extra context (e.g. ban reason, old value vs. new value).
     * Stored as Mixed so any JSON-serialisable value is accepted.
     */
    details: {
      type: mongoose.Schema.Types.Mixed,
    },
  },
  {
    // Only createdAt is meaningful for an immutable audit trail; updatedAt is omitted.
    timestamps: { createdAt: true, updatedAt: false },
  }
);

// Compound index to support the most common admin dashboard queries
auditLogSchema.index({ adminId: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ targetType: 1, targetId: 1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
