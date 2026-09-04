import api from './axiosClient';
export const getNotifications = (page) => api.get('/notifications', { params: { page } }).then(r => r.data);
export const markAsRead = (id) => api.patch(`/notifications/${id}/read`);
export const markAllAsRead = () => api.patch('/notifications/read-all');
export const getUnreadCount = () => api.get('/notifications/unread-count').then(r => r.data.data);
