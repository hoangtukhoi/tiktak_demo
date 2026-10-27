/**
 * Comment Controller
 * Handles all comment-related HTTP operations: listing, creating, deleting, replying, and liking comments.
 */

const mongoose = require('mongoose');
const Comment = require('../models/Comment');
const Video = require('../models/Video');
const Like = require('../models/Like');
const notificationService = require('../services/notification.service');
const { success, error, paginated } = require('../utils/apiResponse');

/**
 * GET /comments/video/:videoId
 * Returns top-level comments (parentId = null) for a video using cursor-based pagination.
 * Populates author info and adds `isLiked` field when the requester is authenticated.
 */
exports.getComments = async (req, res) => {
  try {
    const { videoId } = req.params;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const { cursor } = req.query;

    if (!mongoose.Types.ObjectId.isValid(videoId)) {
      return error(res, 'Invalid videoId', 400);
    }

    // Build cursor query — fetch comments older than the cursor _id
    const query = {
      videoId,
      parentId: null,
      isDeleted: false,
    };
    if (cursor && mongoose.Types.ObjectId.isValid(cursor)) {
      query._id = { $lt: new mongoose.Types.ObjectId(cursor) };
    }

    const comments = await Comment.find(query)
      .sort({ _id: -1 })
      .limit(limit + 1) // fetch one extra to detect if there's a next page
      .populate('userId', 'username avatarUrl')
      .lean();

    // Determine pagination metadata
    const hasMore = comments.length > limit;
    if (hasMore) comments.pop(); // remove the extra document

    // Attach isLiked flag for authenticated users
    if (req.user && comments.length > 0) {
      const commentIds = comments.map((c) => c._id);
      const likes = await Like.find({
        userId: req.user._id,
        targetId: { $in: commentIds },
        targetType: 'comment',
      }).select('targetId').lean();

      const likedSet = new Set(likes.map((l) => l.targetId.toString()));
      comments.forEach((c) => {
        c.isLiked = likedSet.has(c._id.toString());
      });
    } else {
      comments.forEach((c) => {
        c.isLiked = false;
      });
    }

    const nextCursor = hasMore ? comments[comments.length - 1]._id : null;

    return paginated(res, comments, { nextCursor, hasMore, limit });
  } catch (err) {
    console.error('[getComments]', err);
    return error(res, 'Failed to fetch comments', 500);
  }
};

/**
 * GET /comments/:id/replies
 * Returns paginated replies (children) for a given comment using cursor-based pagination.
 * Populates author info.
 */
exports.getReplies = async (req, res) => {
  try {
    const { id } = req.params;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const { cursor } = req.query;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return error(res, 'Invalid comment id', 400);
    }

    const query = { parentId: id, isDeleted: false };
    if (cursor && mongoose.Types.ObjectId.isValid(cursor)) {
      query._id = { $lt: new mongoose.Types.ObjectId(cursor) };
    }

    const replies = await Comment.find(query)
      .sort({ _id: -1 })
      .limit(limit + 1)
      .populate('userId', 'username avatarUrl')
      .lean();

    const hasMore = replies.length > limit;
    if (hasMore) replies.pop();

    // Attach isLiked for authenticated users
    if (req.user && replies.length > 0) {
      const replyIds = replies.map((r) => r._id);
      const likes = await Like.find({
        userId: req.user._id,
        targetId: { $in: replyIds },
        targetType: 'comment',
      }).select('targetId').lean();

      const likedSet = new Set(likes.map((l) => l.targetId.toString()));
      replies.forEach((r) => {
        r.isLiked = likedSet.has(r._id.toString());
      });
    } else {
      replies.forEach((r) => {
        r.isLiked = false;
      });
    }

    const nextCursor = hasMore ? replies[replies.length - 1]._id : null;

    return paginated(res, replies, { nextCursor, hasMore, limit });
  } catch (err) {
    console.error('[getReplies]', err);
    return error(res, 'Failed to fetch replies', 500);
  }
};

/**
 * POST /comments
 * Creates a new comment or reply.
 * Body: { videoId, content, parentId? }
 *
 * Side effects:
 *  - Increments video.commentCount
 *  - If reply, increments parent.replyCount
 *  - Sends new_comment notification to video owner
 *  - Sends mention notification to parent comment author (if this is a reply)
 */
exports.createComment = async (req, res) => {
  try {
    const { videoId, content, parentId } = req.body;

    if (!videoId || !content) {
      return error(res, 'videoId and content are required', 400);
    }
    if (!mongoose.Types.ObjectId.isValid(videoId)) {
      return error(res, 'Invalid videoId', 400);
    }

    // Ensure the video exists and allows comments
    const video = await Video.findById(videoId);
    if (!video) return error(res, 'Video not found', 404);
    if (!video.allowComment) return error(res, 'Comments are disabled for this video', 403);

    // Validate parent comment if this is a reply
    let parentComment = null;
    if (parentId) {
      if (!mongoose.Types.ObjectId.isValid(parentId)) {
        return error(res, 'Invalid parentId', 400);
      }
      parentComment = await Comment.findOne({ _id: parentId, isDeleted: false });
      if (!parentComment) return error(res, 'Parent comment not found', 404);
    }

    // Create the comment using `content` (not `text`) as defined in the schema
    const comment = await Comment.create({
      videoId,
      userId: req.user._id,
      content,
      parentId: parentId || null,
    });

    // Atomically increment counters
    await Video.findByIdAndUpdate(videoId, { $inc: { commentCount: 1 } });
    if (parentComment) {
      await Comment.findByIdAndUpdate(parentId, { $inc: { replyCount: 1 } });
    }

    // Build actor payload for notifications (reused below)
    const actorPayload = {
      actorId: req.user._id,
      actorUsername: req.user.username,
      actorAvatar: req.user.avatarUrl,
      videoId: video._id,
      videoThumbnail: video.thumbnailUrl,
      commentId: comment._id,
    };

    // Notify the video owner (skip if the commenter IS the owner)
    if (video.userId.toString() !== req.user._id.toString()) {
      await notificationService.createNotification(
        video.userId,
        'new_comment',
        actorPayload
      );
    }

    // Notify the parent comment author when this is a reply (mention)
    if (parentComment && parentComment.userId.toString() !== req.user._id.toString()) {
      await notificationService.createNotification(
        parentComment.userId,
        'mention',
        { ...actorPayload, message: content.slice(0, 100) }
      );
    }

    // Populate author info before returning
    await comment.populate('userId', 'username avatarUrl');

    return success(res, comment, 201, 'Comment created');
  } catch (err) {
    console.error('[createComment]', err);
    return error(res, 'Failed to create comment', 500);
  }
};

/**
 * DELETE /comments/:id
 * Soft-deletes a comment by setting isDeleted = true.
 * Only the comment author may delete their own comment.
 * Decrements video.commentCount (top-level) or parent.replyCount (reply).
 */
exports.deleteComment = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return error(res, 'Invalid comment id', 400);
    }

    const comment = await Comment.findOne({ _id: id, isDeleted: false });
    if (!comment) return error(res, 'Comment not found', 404);

    // Only the author may delete
    if (comment.userId.toString() !== req.user._id.toString()) {
      return error(res, 'Forbidden', 403);
    }

    // Soft delete
    comment.isDeleted = true;
    await comment.save();

    // Lúc tạo, cả comment gốc lẫn reply đều +1 commentCount của video,
    // nên lúc xoá cũng luôn -1 (không cho xuống âm).
    await Video.updateOne(
      { _id: comment.videoId, commentCount: { $gt: 0 } },
      { $inc: { commentCount: -1 } }
    );
    if (comment.parentId) {
      await Comment.updateOne(
        { _id: comment.parentId, replyCount: { $gt: 0 } },
        { $inc: { replyCount: -1 } }
      );
    }

    return success(res, null, 200, 'Comment deleted');
  } catch (err) {
    console.error('[deleteComment]', err);
    return error(res, 'Failed to delete comment', 500);
  }
};

/**
 * POST /comments/:id/like
 * Toggles a like on a comment.
 * - If the user has already liked it, removes the like and decrements likeCount.
 * - If not, creates a like and increments likeCount.
 */
exports.likeComment = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return error(res, 'Invalid comment id', 400);
    }

    const comment = await Comment.findOne({ _id: id, isDeleted: false });
    if (!comment) return error(res, 'Comment not found', 404);

    // Check if the user already liked this comment
    const existingLike = await Like.findOne({
      userId: req.user._id,
      targetId: id,
      targetType: 'comment',
    });

    if (existingLike) {
      // Unlike: remove the like document and decrement counter
      await existingLike.deleteOne();
      await Comment.updateOne({ _id: id, likeCount: { $gt: 0 } }, { $inc: { likeCount: -1 } });
      return success(res, { liked: false }, 200, 'Comment unliked');
    }

    // Like: create the like document and increment counter
    await Like.create({
      userId: req.user._id,
      targetId: id,
      targetType: 'comment',
    });
    await Comment.findByIdAndUpdate(id, { $inc: { likeCount: 1 } });

    return success(res, { liked: true }, 200, 'Comment liked');
  } catch (err) {
    // Handle race-condition duplicate key errors gracefully
    if (err.code === 11000) {
      return success(res, { liked: true }, 200, 'Comment already liked');
    }
    console.error('[likeComment]', err);
    return error(res, 'Failed to toggle like', 500);
  }
};