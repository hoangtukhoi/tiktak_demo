import api from './axiosClient';

const d = (r) => r.data.data;
const page = (r) => ({ items: d(r) || [], nextCursor: r.data.pagination?.nextCursor ?? null });

// ── Danh sách theo dõi (có phân trang + tìm theo tên) ─────────────────────
/**
 * Danh sách người theo dõi / đang theo dõi → { items, nextCursor }
 * Mỗi người: { _id, username, displayName, avatarUrl, isVerified, isMe, isFollowing, followsYou }
 * Bị ẩn theo quyền riêng tư → lỗi 403 với response.data.code === 'PRIVATE'
 */
export const getFollowersPage = (user, { cursor, q } = {}) =>
  api.get(`/users/${encodeURIComponent(user)}/followers`, { params: { cursor, q: q || undefined } }).then(page);
export const getFollowingPage = (user, { cursor, q } = {}) =>
  api.get(`/users/${encodeURIComponent(user)}/following`, { params: { cursor, q: q || undefined } }).then(page);
/** Xoá 1 người khỏi danh sách người theo dõi mình */
export const removeFollower = (userId) => api.delete(`/users/me/followers/${userId}`).then(d);

// ── Chặn ───────────────────────────────────────────────────────────────────
export const blockUser = (username) => api.post(`/users/${encodeURIComponent(username)}/block`).then(d);
export const unblockUser = (username) => api.delete(`/users/${encodeURIComponent(username)}/block`).then(d);
export const getBlockedUsers = () => api.get('/users/me/blocked').then(d);

// ── Cài đặt quyền riêng tư ─────────────────────────────────────────────────
export const getPrivacy = () => api.get('/users/me/privacy').then(d);
export const updatePrivacy = (patch) => api.patch('/users/me/privacy', patch).then(d);

/** Lỗi do người dùng ẩn mục này (quyền riêng tư) */
export const isPrivateError = (e) => e?.response?.status === 403 && e.response.data?.code === 'PRIVATE';

/** Báo cáo tài khoản (mỗi người 1 lần / tài khoản). reason: USER_REPORT_REASONS */
export const reportUser = (username, reason, note) => api.post(`/users/${encodeURIComponent(username)}/report`, { reason, note }).then(d);

// ── Đổi mật khẩu ───────────────────────────────────────────────────────────
/**
 * PATCH /users/me/change-password -> { accessToken, refreshToken }
 * Server đăng xuất mọi thiết bị khác nên lưu luôn cặp token mới cho phiên hiện tại.
 * Tài khoản Google chưa có mật khẩu: để trống currentPassword.
 */
export const changePassword = (currentPassword, newPassword) =>
  api.patch('/users/me/change-password', { currentPassword, newPassword }).then(d).then((tokens) => {
    localStorage.setItem('accessToken', tokens.accessToken);
    localStorage.setItem('refreshToken', tokens.refreshToken);
    return tokens;
  });
