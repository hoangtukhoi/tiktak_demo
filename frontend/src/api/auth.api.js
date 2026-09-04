import api from './axiosClient';
export const login = (email, password) => api.post('/auth/login', { email, password }).then(r => r.data.data);
export const register = (username, email, password) => api.post('/auth/register', { username, email, password }).then(r => r.data.data);
export const logout = (refreshToken) => api.post('/auth/logout', { refreshToken });
export const getMe = () => api.get('/auth/me').then(r => r.data.data);
export const refresh = (refreshToken) => api.post('/auth/refresh', { refreshToken }).then(r => r.data.data);
