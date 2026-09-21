const mongoose = require('mongoose');

const Comment = require('../models/Comment');
const Video = require('../models/Video');
const Like = require('../models/Like');
const notificationService = require('./notification.service');
const { NOTIFICATION_TYPES, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } = require('../utils/constants');

const AUTHOR_FIELDS = 'username avatarUrl isVerified';
const httpError = (message, statusCode) => Object.assign(new Error(message), { statusCode });
const clampLimit = (limit) => Math.min(Math.max(Number(limit) || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);

/** Gắn cờ isLiked cho danh sách bình luận. */
async function decorate(comments, currentUserId) {
  if (!comments.length || !currentUserId) {
    return comments.map((c) => ({ ...c, isLiked: false }));
  }
  const likes = await Like.find({
    userId: currentUserId,
    targetType: 'comment',
    targetId: { $in: comments.map((c) => c._id) },
  })
    .select('targetId')
    .lean();
  const likedSet = new Set(likes.map((l) => String(l.targetId)));
  return comments.map((c) => ({ ...c, isLiked: likedSet.has(String(c._id)) }));
}

async function createComment(userId, { videoId, content, parentId = null }) {
  const video = await Video.findOne({ _id: videoId, isDeleted: false }).select(
    'userId allowComment thumbnailUrl'
  );
  if (!video) throw httpError('Không tìm thấy video', 404);
  if (!video.allowComment) throw httpError('Video này đã tắt bình luận', 403);

  if (parentId) {
    const parent = await Comment.findOne({ _id: parentId, videoId, isDeleted: false });
    if (!parent) throw httpError('Không tìm thấy bình luận gốc', 404);
    // Chỉ cho phép lồng một cấp: trả lời của trả lời vẫn gắn vào comment gốc.
    parentId = parent.parentId || parent._id;
  }

  const comment = await Comment.create({ videoId, userId, parentId, content });

  await Promise.all([
    Video.findByIdAndUpdate(videoId, { $inc: { commentCount: 1 } }),
    parentId ? Comment.findByIdAndUpdate(parentId, { $inc: { replyCount: 1 } }) : Promise.resolve(),
  ]);

  const recipientId = parentId
    ? (await Comment.findById(parentId).select('userId').lean())?.userId
    : video.userId;

  await notificationService.createNotification(recipientId, NOTIFICATION_TYPES.NEW_COMMENT, {
    actorId: userId,
    videoId,
    commentId: comment._id,
    videoThumbnail: video.thumbnailUrl,
    message: parentId ? 'đã trả lời bình luận của bạn' : 'đã bình luận video của bạn',
  });

  return comment.populate('userId', AUTHOR_FIELDS);
}

/** Bình luận gốc của một video, kèm tối đa 2 reply xem trước. */
async function getComments(videoId, { cursor, limit = DEFAULT_PAGE_SIZE, currentUserId } = {}) {
  const query = { videoId, parentId: null, isDeleted: false };
  if (cursor && mongoose.isValidObjectId(cursor)) query._id = { $lt: cursor };

  const size = clampLimit(limit);
  const rows = await Comment.find(query)
    .sort({ _id: -1 })
    .limit(size + 1)
    .populate('userId', AUTHOR_FIELDS)
    .lean();

  const hasMore = rows.length > size;
  const comments = await decorate(hasMore ? rows.slice(0, size) : rows, currentUserId);

  return {
    comments,
    nextCursor: hasMore ? String(comments[comments.length - 1]._id) : null,
    hasMore,
  };
}

async function getReplies(parentId, { cursor, limit = DEFAULT_PAGE_SIZE, currentUserId } = {}) {
  const query = { parentId, isDeleted: false };
  if (cursor && mongoose.isValidObjectId(cursor)) query._id = { $gt: cursor };

  const size = clampLimit(limit);
  const rows = await Comment.find(query)
    .sort({ _id: 1 })
    .limit(size + 1)
    .populate('userId', AUTHOR_FIELDS)
    .lean();

  const hasMore = rows.length > size;
  const replies = await decorate(hasMore ? rows.slice(0, size) : rows, currentUserId);

  return {
    replies,
    nextCursor: hasMore ? String(replies[replies.length - 1]._id) : null,
    hasMore,
  };
}

/** Tác giả bình luận hoặc chủ video đều được xoá. */
async function deleteComment(commentId, userId) {
  const comment = await Comment.findOne({ _id: commentId, isDeleted: false });
  if (!comment) throw httpError('Không tìm thấy bình luận', 404);

  const video = await Video.findById(comment.videoId).select('userId');
  const isOwner = String(comment.userId) === String(userId);
  const isVideoOwner = video && String(video.userId) === String(userId);
  if (!isOwner && !isVideoOwner) throw httpError('Bạn không có quyền xoá bình luận này', 403);

  comment.isDeleted = true;
  await comment.save();

  const replyCount = comment.parentId ? 0 : await Comment.countDocuments({ parentId: comment._id, isDeleted: false });

  await Promise.all([
    Video.findByIdAndUpdate(comment.videoId, { $inc: { commentCount: -(1 + replyCount) } }),
    comment.parentId
      ? Comment.findByIdAndUpdate(comment.parentId, { $inc: { replyCount: -1 } })
      : Comment.updateMany({ parentId: comment._id }, { isDeleted: true }),
  ]);

  return true;
}

async function toggleLike(commentId, userId) {
  const comment = await Comment.findOne({ _id: commentId, isDeleted: false }).select('userId likeCount');
  if (!comment) throw httpError('Không tìm thấy bình luận', 404);

  const existing = await Like.findOne({ userId, targetId: commentId, targetType: 'comment' });
  if (existing) {
    await existing.deleteOne();
    const updated = await Comment.findByIdAndUpdate(commentId, { $inc: { likeCount: -1 } }, { new: true });
    return { isLiked: false, likeCount: Math.max(0, updated.likeCount) };
  }

  await Like.create({ userId, targetId: commentId, targetType: 'comment' });
  const updated = await Comment.findByIdAndUpdate(commentId, { $inc: { likeCount: 1 } }, { new: true });
  return { isLiked: true, likeCount: updated.likeCount };
}

module.exports = { createComment, getComments, getReplies, deleteComment, toggleLike };
