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

/** Notification model: { type, payload:{actorUsername, videoId, message, context...}, isRead } */
export const normalizeNotification = (n) => {
  const p = n.payload || {};
  let text;
  if (n.type === 'mention' || n.type === 'new_comment') {
    const verb = n.type === 'mention' ? MENTION_VERB[p.context] || VERB.mention : VERB.new_comment;
    text = p.message ? `${verb}: “${p.message}”` : verb;
  } else {
    text = p.message || VERB[n.type] || 'Thông báo mới';
  }
  return {
    ...n,
    isRead: n.isRead ?? n.read ?? false,
    actor: p.actorUsername || null,
    text,
    videoId: p.videoId || null,
  };
};

export const getNotifications = (page = 1) =>
  api.get('/notifications', { params: { page } }).then((r) => (d(r) || []).map(normalizeNotification));
export const markAsRead = (id) => api.patch(`/notifications/${id}/read`);
export const markAllAsRead = () => api.post('/notifications/read-all');
export const getUnreadCount = () => api.get('/notifications/unread-count').then((r) => d(r)?.count ?? 0);
