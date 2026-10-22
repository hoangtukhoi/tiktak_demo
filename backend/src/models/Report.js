const mongoose = require('mongoose');

/**
 * Report model — tracks user reports on videos.
 * Uniqueness is enforced per (reporterId + videoId) so a user can only
 * report the same video once.
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
      enum: ['spam', 'violence', 'sexual', 'other'],
      required: true,
    },
  },
  { timestamps: true }
);

// Prevent duplicate reports from the same user on the same video
reportSchema.index({ videoId: 1, reporterId: 1 }, { unique: true });

module.exports = mongoose.model('Report', reportSchema);
