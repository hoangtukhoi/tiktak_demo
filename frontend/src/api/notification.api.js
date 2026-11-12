import api from './axiosClient';

const d = (r) => r.data.data;

const VERB = {
  new_like: 'đã thích video của bạn',
  new_comment: 'đã bình luận video của bạn',
  new_follower: 'đã bắt đầu theo dõi bạn',
  mention: 'đã nhắc đến bạn',
  video_ready: 'Video của bạn đã xử lý xong và sẵn sàng',
  dubbing_done: 'Bản lồng tiếng AI cho video của bạn đã hoàn tất',
  repost: 'đã đăng lại video của bạn',
};

// Câu thông báo theo ngữ cảnh (payload.context) — kèm trích dẫn nội dung bình luận nếu có
const MENTION_VERB = {
  reply: 'đã trả lời bình luận của bạn',
  comment: 'đã nhắc đến bạn trong một bình luận',
  video: 'đã nhắc đến bạn trong video',
};

// Admin / kiểm duyệt viên đã xử lý nội dung của bạn (type 'moderation')
const MODERATION_TEXT = {
  video_removed: 'Video của bạn đã bị gỡ vì vi phạm tiêu chuẩn cộng đồng',
  video_restored: 'Video của bạn đã được khôi phục',
  comment_hidden: 'Bình luận của bạn đã bị ẩn vì vi phạm tiêu chuẩn cộng đồng',
  comment_restored: 'Bình luận của bạn đã được duyệt và hiện công khai',
};

/** Notification model: { type, payload:{actorUsername, videoId, message, context...}, isRead } */
export const normalizeNotification = (n) => {
  const p = n.payload || {};
  let text;
  if (n.type === 'mention' || n.type === 'new_comment') {
    const verb = n.type === 'mention' ? MENTION_VERB[p.context] || VERB.mention : VERB.new_comment;
    text = p.message ? `${verb}: “${p.message}”` : verb;
  } else if (n.type === 'moderation') {
    text = MODERATION_TEXT[p.context] || 'Nội dung của bạn đã được đội kiểm duyệt xem xét';
    if (p.excerpt) text += `: “${p.excerpt}”`;
    if (p.reason) text += ` — Lý do: ${p.reason}`;
  } else {
    text = p.message || VERB[n.type] || 'Thông báo mới';
  }
  return {
    ...n,
    isRead: n.isRead ?? n.read ?? false,
    actor: p.actorUsername || null,
    text,
    // Video đã bị gỡ thì không mở được nữa → không gắn link
    videoId: n.type === 'moderation' && p.context === 'video_removed' ? null : p.videoId || null,
  };
};

export const getNotifications = (page = 1) =>
  api.get('/notifications', { params: { page } }).then((r) => (d(r) || []).map(normalizeNotification));
export const markAsRead = (id) => api.patch(`/notifications/${id}/read`);
export const markAllAsRead = () => api.post('/notifications/read-all');
export const getUnreadCount = () => api.get('/notifications/unread-count').then((r) => d(r)?.count ?? 0);
