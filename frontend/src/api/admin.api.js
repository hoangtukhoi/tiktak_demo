import api from './axiosClient';
import { normalizeVideo } from './video.api';

const d = (r) => r.data.data;

// routes/admin.routes.js — yêu cầu role 'admin'
export const getStats = () => api.get('/admin/stats').then(d);
export const getUsers = () => api.get('/admin/users').then(d);
export const banUser = (id) => api.post(`/admin/users/${id}/ban`).then(d);
export const unbanUser = (id) => api.post(`/admin/users/${id}/unban`).then(d);
export const verifyUser = (id) => api.post(`/admin/users/${id}/verify`).then(d);
export const getAdminVideos = () => api.get('/admin/videos').then((r) => (d(r) || []).map(normalizeVideo));
export const getFlaggedVideos = () => api.get('/admin/videos/flagged').then((r) => (d(r) || []).map(normalizeVideo));
export const removeVideo = (id) => api.delete(`/admin/videos/${id}`);
export const approveVideo = (id) => api.post(`/admin/videos/${id}/approve`);
export const getAuditLogs = () => api.get('/admin/audit-logs').then(d);

// Báo cáo video gom theo video: { ...video, openReports, reasonCounts, reports[] }
export const getReports = (status = 'open') =>
  api.get('/admin/reports', { params: { status } }).then((r) => (d(r) || []).map((v) => ({ ...normalizeVideo(v), reports: v.reports || [] })));

// Hàng chờ kiểm duyệt bình luận: status = pending | rejected | approved
export const getModerationComments = (status = 'pending') => api.get('/admin/comments', { params: { status } }).then(d);
export const approveComment = (id) => api.post(`/admin/comments/${id}/approve`).then(d);
export const rejectComment = (id) => api.post(`/admin/comments/${id}/reject`).then(d);
