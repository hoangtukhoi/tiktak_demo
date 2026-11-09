import api from './axiosClient';

const d = (r) => r.data.data;

// POST /auth/login|register -> { user, accessToken, refreshToken }
export const login = (email, password) => api.post('/auth/login', { email, password }).then(d);
export const register = (username, email, password) => api.post('/auth/register', { username, email, password }).then(d);
export const logout = (refreshToken) => api.post('/auth/logout', { refreshToken });
export const getMe = () => api.get('/auth/me').then(d);
export const refresh = (refreshToken) => api.post('/auth/refresh', { refreshToken }).then(d);

// ---- /users ----
// getProfile nên trả thêm `isFollowing` (người đang đăng nhập có theo dõi user này không)
export const getProfile = (username) => api.get(`/users/${encodeURIComponent(username)}`).then(d);
export const updateProfile = (data) => api.patch('/users/me', data).then(d);
export const searchUsers = (q) => api.get('/users/search', { params: { q } }).then(d);

/** POST /users/me/avatar (multipart field `avatar`, dùng imageUpload middleware) -> User */
export const uploadAvatar = (file) => {
  const fd = new FormData();
  fd.append('avatar', file);
  return api.post('/users/me/avatar', fd, { headers: { 'Content-Type': 'multipart/form-data' } }).then(d);
};

// Follow (model Follow đã có) -> { isFollowing, followerCount }
export const followUser = (userId) => api.post(`/users/${userId}/follow`).then(d);
export const unfollowUser = (userId) => api.delete(`/users/${userId}/follow`).then(d);
// -> [User & { isFollowing }]
export const getFollowers = (userId) => api.get(`/users/${userId}/followers`).then(d);
export const getFollowing = (userId) => api.get(`/users/${userId}/following`).then(d);
