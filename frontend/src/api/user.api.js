import api from './axiosClient';
import { normalizeVideo } from './video.api';

const d = (r) => r.data.data;
const page = (r) => ({ items: d(r) || [], nextCursor: r.data.pagination?.nextCursor ?? null });

// ── Theo dõi ────────────────────────────────────────────────────────────────
/** Bật/tắt theo dõi → { following } */
export const toggleFollow = (username) => api.post(`/users/${encodeURIComponent(username)}/follow`).then(d);
/**
 * Danh sách người theo dõi / đang theo dõi → { items, nextCursor }
 * Mỗi người: { _id, username, displayName, avatarUrl, isVerified, isMe, isFollowing, followsYou }
 * Bị ẩn theo quyền riêng tư → lỗi 403 với response.data.code === 'PRIVATE'
 */
export const getFollowers = (username, { cursor, q } = {}) =>
  api.get(`/users/${encodeURIComponent(username)}/followers`, { params: { cursor, q: q || undefined } }).then(page);
export const getFollowing = (username, { cursor, q } = {}) =>
  api.get(`/users/${encodeURIComponent(username)}/following`, { params: { cursor, q: q || undefined } }).then(page);
/** Xoá 1 người khỏi danh sách người theo dõi mình */
export const removeFollower = (userId) => api.delete(`/users/me/followers/${userId}`).then(d);

// ── Video đã thích của người khác (theo cài đặt của họ) ─────────────────────
export const getUserLiked = (username, cursor) =>
  api.get(`/users/${encodeURIComponent(username)}/liked`, { params: { cursor } }).then((r) => ({
    videos: (d(r) || []).map(normalizeVideo),
    nextCursor: r.data.pagination?.nextCursor ?? null,
  }));

// ── Chặn ───────────────────────────────────────────────────────────────────
export const blockUser = (username) => api.post(`/users/${encodeURIComponent(username)}/block`).then(d);
export const unblockUser = (username) => api.delete(`/users/${encodeURIComponent(username)}/block`).then(d);
export const getBlockedUsers = () => api.get('/users/me/blocked').then(d);

// ── Cài đặt quyền riêng tư ─────────────────────────────────────────────────
export const getPrivacy = () => api.get('/users/me/privacy').then(d);
export const updatePrivacy = (patch) => api.patch('/users/me/privacy', patch).then(d);

/** Lỗi do người dùng ẩn mục này (quyền riêng tư) */
export const isPrivateError = (e) => e?.response?.status === 403 && e.response.data?.code === 'PRIVATE';
