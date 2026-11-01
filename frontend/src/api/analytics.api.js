import api from './axiosClient';

const d = (r) => r.data.data;

// Creator: số liệu của chính mình theo tab — tab: overview | content | viewers | followers; range: 7 | 28 | 60 | 365
export const getMyAnalyticsTab = (tab, range = 7) => api.get(`/users/me/analytics/${tab}`, { params: { range } }).then(d);
export const getMyVideoAnalytics = (id, range = 28) => api.get(`/users/me/analytics/videos/${id}`, { params: { range } }).then(d);

// Admin — range: 7 | 30 | 90 (ngày)
export const getAdminAnalytics = (range = 30) => api.get('/admin/analytics', { params: { range } }).then(d);

// Admin xem phân tích của bất kỳ video nào
export const getAdminVideoAnalytics = (id, range = 30) => api.get(`/admin/analytics/videos/${id}`, { params: { range } }).then(d);

// So sánh 2–3 video của chính mình (tính từ lúc đăng)
export const compareMyVideos = (ids) => api.get('/users/me/analytics/compare', { params: { ids: ids.join(',') } }).then(d);
