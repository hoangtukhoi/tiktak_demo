import api from './axiosClient';
export const getForYouFeed = (cursor) => api.get('/feed/for-you', { params: { cursor } }).then(r => r.data.data);
export const getFollowingFeed = (cursor) => api.get('/feed/following', { params: { cursor } }).then(r => r.data.data);
export const getVideo = (id) => api.get(`/videos/${id}`).then(r => r.data.data);
export const likeVideo = (id) => api.post(`/videos/${id}/like`).then(r => r.data.data);
export const recordView = (id, watchTimeMs) => api.post(`/videos/${id}/view`, { watchTimeMs });
export const createVideo = (data) => api.post('/videos', data).then(r => r.data.data);
export const uploadVideoFile = (formData, onProgress) => api.post('/upload', formData, {
  headers: { 'Content-Type': 'multipart/form-data' },
  onUploadProgress: e => onProgress?.(Math.round((e.loaded / e.total) * 100)),
}).then(r => r.data.data);
export const getProgressSSE = (jobId, onProgress, onDone) => {
  const es = new EventSource(`/api/upload/${jobId}/progress`);
  es.onmessage = e => { const d = JSON.parse(e.data); onProgress?.(d); if (d.status === 'completed' || d.status === 'failed') { onDone?.(d); es.close(); } };
  return es;
};
export const getUserVideos = (userId, cursor) => api.get(`/users/${userId}/videos`, { params: { cursor } }).then(r => r.data.data);
export const searchVideos = (q, page) => api.get('/videos/search', { params: { q, page } }).then(r => r.data);
export const deleteVideo = (id) => api.delete(`/videos/${id}`);
