import api from './axiosClient';

export const getStats = () => api.get('/admin/stats').then((r) => r.data.data);

export const getUsers = (params) => api.get('/admin/users', { params }).then((r) => r.data.data);

export const banUser = (id, reason) =>
  api.post(`/admin/users/${id}/ban`, { reason }).then((r) => r.data.data);

export const unbanUser = (id) => api.post(`/admin/users/${id}/unban`).then((r) => r.data.data);

export const verifyUser = (id) => api.post(`/admin/users/${id}/verify`).then((r) => r.data.data);

export const getVideos = (params) => api.get('/admin/videos', { params }).then((r) => r.data.data);

export const getFlaggedVideos = (params) =>
  api.get('/admin/videos/flagged', { params }).then((r) => r.data.data);

export const approveVideo = (id) =>
  api.post(`/admin/videos/${id}/approve`).then((r) => r.data.data);

export const removeVideo = (id, reason) =>
  api.delete(`/admin/videos/${id}`, { data: { reason } }).then((r) => r.data.data);

export const getReports = (params) => api.get('/admin/reports', { params }).then((r) => r.data.data);

export const getAuditLogs = (params) =>
  api.get('/admin/audit-logs', { params }).then((r) => r.data.data);
