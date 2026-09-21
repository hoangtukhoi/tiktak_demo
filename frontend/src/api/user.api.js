import api from './axiosClient';

export const getProfile = (username) => api.get(`/users/${username}`).then((r) => r.data.data);

export const updateProfile = (data) => api.patch('/users/me', data).then((r) => r.data.data);

export const searchUsers = (q) =>
  api.get('/users/search', { params: { q } }).then((r) => r.data.data);

export const toggleFollow = (username) =>
  api.post(`/users/${username}/follow`).then((r) => r.data.data);

export const getFollowers = (username, page) =>
  api.get(`/users/${username}/followers`, { params: { page } }).then((r) => r.data.data);

export const getFollowing = (username, page) =>
  api.get(`/users/${username}/following`, { params: { page } }).then((r) => r.data.data);
