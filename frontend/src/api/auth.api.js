import api from './axiosClient';

const d = (r) => r.data.data;

// POST /auth/login|register -> { user, accessToken, refreshToken }
export const login = (email, password) => api.post('/auth/login', { email, password }).then(d);
export const register = (username, email, password) => api.post('/auth/register', { username, email, password }).then(d);
export const logout = (refreshToken) => api.post('/auth/logout', { refreshToken });
export const getMe = () => api.get('/auth/me').then(d);
export const refresh = (refreshToken) => api.post('/auth/refresh', { refreshToken }).then(d);

// /users
export const getProfile = (username) => api.get(`/users/${encodeURIComponent(username)}`).then(d);
export const updateProfile = (data) => api.patch('/users/me', data).then(d);
export const searchUsers = (q) => api.get('/users/search', { params: { q } }).then(d);
