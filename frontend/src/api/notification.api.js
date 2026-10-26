import api from './axiosClient';

const d = (r) => r.data.data;

const VERB = {
  new_like: 'đã thích video của bạn',
  new_comment: 'đã bình luận video của bạn',
  new_follower: 'đã bắt đầu theo dõi bạn',
  mention: 'đã nhắc đến bạn',
  video_ready: 'Video của bạn đã xử lý xong và sẵn sàng',
  dubbing_done: 'Bản lồng tiếng AI cho video của bạn đã hoàn tất',
};

/** Notification model: { type, payload:{actorUsername, videoId, message...}, isRead } (service đang dùng `read`) */
export const normalizeNotification = (n) => ({
  ...n,
  isRead: n.isRead ?? n.read ?? false,
  actor: n.payload?.actorUsername || null,
  text: n.payload?.message || VERB[n.type] || 'Thông báo mới',
  videoId: n.payload?.videoId || null,
});

export const getNotifications = (page = 1) =>
  api.get('/notifications', { params: { page } }).then((r) => (d(r) || []).map(normalizeNotification));
export const markAsRead = (id) => api.patch(`/notifications/${id}/read`);
export const markAllAsRead = () => api.post('/notifications/read-all');
export const getUnreadCount = () => api.get('/notifications/unread-count').then((r) => d(r)?.count ?? 0);
