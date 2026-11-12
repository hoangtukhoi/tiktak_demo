import api from './axiosClient';
import { normalizeVideo } from './video.api';

const d = (r) => r.data.data;
/** Trang có phân trang → { items, page, totalPages, total } */
const paged = (map = (x) => x) => (r) => {
  const p = r.data.pagination || {};
  return { items: (d(r) || []).map(map), page: p.page || 1, totalPages: p.totalPages || 1, total: p.total ?? (d(r) || []).length };
};
const clean = (params) => Object.fromEntries(Object.entries(params || {}).filter(([, v]) => v !== '' && v !== undefined && v !== null));
const withReports = (v) => ({ ...v, reports: v.reports || [] });

// routes/admin.routes.js — admin + kiểm duyệt viên (moderator); mục ghi "chỉ admin" thì moderator bị 403
export const getStats = () => api.get('/admin/stats').then(d);

// ── Người dùng ──  params: { page, search, role, status: banned | active | verified }
export const getUsers = (params) => api.get('/admin/users', { params: clean(params) }).then(paged());
/** Chỉ admin. reason: lý do khoá (hiện cho người bị khoá khi đăng nhập) */
export const banUser = (id, reason) => api.post(`/admin/users/${id}/ban`, { reason }).then(d);
export const unbanUser = (id) => api.post(`/admin/users/${id}/unban`).then(d);
export const verifyUser = (id) => api.post(`/admin/users/${id}/verify`).then(d);
export const unverifyUser = (id) => api.post(`/admin/users/${id}/unverify`).then(d);
/** Chỉ admin. role: user | moderator | admin */
export const changeRole = (id, role) => api.post(`/admin/users/${id}/role`, { role }).then(d);

// ── Video ──  params: { page, search, status, moderationStatus }
export const getAdminVideos = (params) => api.get('/admin/videos', { params: clean(params) }).then(paged(normalizeVideo));
export const getFlaggedVideos = (params) => api.get('/admin/videos/flagged', { params: clean(params) }).then(paged(normalizeVideo));
/** reason: lý do gỡ (gửi kèm thông báo cho chủ video) */
export const removeVideo = (id, reason) => api.delete(`/admin/videos/${id}`, { data: { reason } });
export const approveVideo = (id) => api.post(`/admin/videos/${id}/approve`);

// ── Báo cáo ──  gom theo đối tượng: { ...đối tượng, openReports, reasonCounts, reports[] }
export const getReports = (params) => api.get('/admin/reports', { params: clean(params) }).then(paged((v) => withReports(normalizeVideo(v))));
export const getCommentReports = (params) => api.get('/admin/reports/comments', { params: clean(params) }).then(paged(withReports));
export const getUserReports = (params) => api.get('/admin/reports/users', { params: clean(params) }).then(paged(withReports));
/** Bỏ qua (không vi phạm): đóng các báo cáo đang mở, giữ nguyên nội dung */
export const dismissCommentReports = (commentId) => api.post(`/admin/reports/comments/${commentId}/dismiss`).then(d);
export const dismissUserReports = (userId) => api.post(`/admin/reports/users/${userId}/dismiss`).then(d);

// ── Kiểm duyệt bình luận ──  params: { status: pending | rejected | approved, page, search }
export const getModerationComments = (params) => api.get('/admin/comments', { params: clean(params) }).then(paged());
export const approveComment = (id) => api.post(`/admin/comments/${id}/approve`).then(d);
export const rejectComment = (id, reason) => api.post(`/admin/comments/${id}/reject`, { reason }).then(d);
/** Bộ kiểm duyệt đang chạy bằng gì: { mode, engine: model | keyword | off, reviewThreshold, rejectThreshold, model?, reason? } */
export const getModerationStatus = () => api.get('/admin/moderation/status').then(d);

// ── Nhật ký (chỉ admin) ──  params: { page, action }
export const getAuditLogs = (params) => api.get('/admin/audit-logs', { params: clean(params) }).then(paged());
