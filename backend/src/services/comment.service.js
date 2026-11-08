/**
 * Logic dùng chung cho bình luận: cập nhật bộ đếm và gửi thông báo khi bình luận
 * được hiện công khai (ngay lúc đăng, hoặc khi admin duyệt bình luận đang chờ).
 */
const Comment = require('../models/Comment');
const Video = require('../models/Video');
const User = require('../models/User');
const notificationService = require('./notification.service');

const isPublicStatus = (status) => !['pending', 'rejected'].includes(status);

/** +1 / -1 commentCount của video và replyCount của bình luận cha (không cho xuống âm) */
async function applyCounters(comment, delta) {
  if (delta > 0) {
    await Video.updateOne({ _id: comment.videoId }, { $inc: { commentCount: 1 } });
    if (comment.parentId) await Comment.updateOne({ _id: comment.parentId }, { $inc: { replyCount: 1 } });
    return;
  }
  await Video.updateOne({ _id: comment.videoId, commentCount: { $gt: 0 } }, { $inc: { commentCount: -1 } });
  if (comment.parentId) {
    await Comment.updateOne({ _id: comment.parentId, replyCount: { $gt: 0 } }, { $inc: { replyCount: -1 } });
  }
}

/**
 * Gửi thông báo cho: tác giả bình luận cha (trả lời), những người được tag (@username),
 * và chủ video (new_comment). Mỗi người nhận tối đa 1 thông báo cho 1 bình luận —
 * ưu tiên thông báo cụ thể hơn (trả lời > được tag > bình luận mới).
 *
 * @param {Comment} comment
 * @param {{ video?: Video, actor?: User, parentComment?: Comment }} [ctx] — truyền vào nếu đã có sẵn
 */
async function notifyPublished(comment, ctx = {}) {
  const video = ctx.video || (await Video.findById(comment.videoId).select('userId thumbnailUrl').lean());
  if (!video) return;
  const actor = ctx.actor || (await User.findById(comment.userId).select('username avatarUrl').lean());
  if (!actor) return;
  const parent =
    ctx.parentComment !== undefined
      ? ctx.parentComment
      : comment.parentId && (await Comment.findById(comment.parentId).select('userId').lean());

  const actorId = String(comment.userId);
  const base = {
    actorId: comment.userId,
    actorUsername: actor.username,
    actorAvatar: actor.avatarUrl,
    videoId: video._id,
    videoThumbnail: video.thumbnailUrl,
    commentId: comment._id,
  };
  const snippet = String(comment.content || '').slice(0, 100);
  const notified = new Set([actorId]);
  const jobs = [];

  if (parent && !notified.has(String(parent.userId))) {
    notified.add(String(parent.userId));
    jobs.push(notificationService.createNotification(parent.userId, 'mention', { ...base, context: 'reply', message: snippet }));
  }
  for (const m of comment.mentions || []) {
    if (!m?.userId || notified.has(String(m.userId))) continue;
    notified.add(String(m.userId));
    jobs.push(notificationService.createNotification(m.userId, 'mention', { ...base, context: 'comment', message: snippet }));
  }
  // Chủ video nhận "bình luận mới" nếu chưa nhận thông báo cụ thể hơn (trả lời / được tag) ở trên
  const ownerId = String(video.userId);
  if (!notified.has(ownerId)) {
    notified.add(ownerId);
    jobs.push(notificationService.createNotification(video.userId, 'new_comment', { ...base, context: 'comment', message: snippet }));
  }
  await Promise.all(jobs);
}

/** Bình luận vừa chuyển sang trạng thái công khai */
async function publish(comment, ctx) {
  await applyCounters(comment, +1);
  await notifyPublished(comment, ctx);
}

module.exports = { applyCounters, notifyPublished, publish, isPublicStatus };
