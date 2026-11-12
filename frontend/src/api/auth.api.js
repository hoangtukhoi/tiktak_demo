import api, { API_URL } from './axiosClient';

const d = (r) => r.data.data;

// POST /auth/login|register -> { user, accessToken, refreshToken }
export const login = (email, password) => api.post('/auth/login', { email, password }).then(d);
export const register = (username, email, password) => api.post('/auth/register', { username, email, password }).then(d);
export const logout = (refreshToken) => api.post('/auth/logout', { refreshToken });
export const getMe = () => api.get('/auth/me').then(d);
export const refresh = (refreshToken) => api.post('/auth/refresh', { refreshToken }).then(d);

// Đăng nhập Google: trình duyệt chuyển hẳn sang trang này (không gọi bằng axios)
export const googleLoginUrl = (from = '/') => `${API_URL}/auth/google?from=${encodeURIComponent(from)}`;
export const getGoogleStatus = () => api.get('/auth/google/status').then(d);
/** Đổi mã 1 lần nhận được sau khi Google chuyển về -> { user, accessToken, refreshToken } */
export const exchangeGoogleCode = (code) => api.post('/auth/google/exchange', { code }).then(d);

// ---- /users ----
// getProfile trả thêm isFollowing, followsYou, isFriend, isBlocked, likeTotal, access (quyền xem các mục)
export const getProfile = (username) => api.get(`/users/${encodeURIComponent(username)}`).then(d);
export const updateProfile = (data) => api.patch('/users/me', data).then(d);
export const searchUsers = (q) => api.get('/users/search', { params: { q } }).then(d);

/** POST /users/me/avatar (multipart field `avatar`) -> User */
export const uploadAvatar = (file) => {
  const fd = new FormData();
  fd.append('avatar', file);
  return api.post('/users/me/avatar', fd, { headers: { 'Content-Type': 'multipart/form-data' } }).then(d);
};

// Theo dõi (userId hoặc username) -> { isFollowing, followerCount }
export const followUser = (userId) => api.post(`/users/${userId}/follow`).then(d);
export const unfollowUser = (userId) => api.delete(`/users/${userId}/follow`).then(d);
// -> [User & { isFollowing, followsYou }] (trang đầu; phân trang + tìm kiếm: xem user.api.js)
export const getFollowers = (userId) => api.get(`/users/${userId}/followers`).then(d);
export const getFollowing = (userId) => api.get(`/users/${userId}/following`).then(d);
