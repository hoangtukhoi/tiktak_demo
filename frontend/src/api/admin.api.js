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
