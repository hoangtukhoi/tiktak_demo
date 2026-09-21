import api from './axiosClient';

// Feed dùng con trỏ (cursor) thay vì số trang để không bị lặp video khi bảng xếp hạng thay đổi.
export const getForYouFeed = (cursor) =>
  api.get('/feed/for-you', { params: { cursor } }).then((r) => r.data.data);

export const getFollowingFeed = (cursor) =>
  api.get('/feed/following', { params: { cursor } }).then((r) => r.data.data);

export const getVideo = (id) => api.get(`/videos/${id}`).then((r) => r.data.data);

export const createVideo = (data) => api.post('/videos', data).then((r) => r.data.data);

export const updateVideo = (id, data) => api.patch(`/videos/${id}`, data).then((r) => r.data.data);

export const deleteVideo = (id) => api.delete(`/videos/${id}`);

export const likeVideo = (id) => api.post(`/videos/${id}/like`).then((r) => r.data.data);

export const recordView = (id, watchTimeMs) => api.post(`/videos/${id}/view`, { watchTimeMs });

export const reportVideo = (id, reason, description) =>
  api.post(`/videos/${id}/report`, { reason, description }).then((r) => r.data.data);

export const searchVideos = (q, page) =>
  api.get('/videos/search', { params: { q, page } }).then((r) => r.data.data);

export const getTrendingHashtags = () =>
  api.get('/videos/hashtags/trending').then((r) => r.data.data);

export const getVideosByHashtag = (tag, cursor) =>
  api.get(`/videos/hashtags/${tag}`, { params: { cursor } }).then((r) => r.data.data);

export const getUserVideos = (username, cursor) =>
  api.get(`/users/${username}/videos`, { params: { cursor } }).then((r) => r.data.data);

/** Upload file video. Backend trả về videoId và jobId để theo dõi transcode. */
export const uploadVideoFile = (formData, onProgress) =>
  api
    .post('/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (e) => onProgress?.(Math.round((e.loaded / (e.total || 1)) * 100)),
    })
    .then((r) => r.data.data);

/**
 * Theo dõi tiến trình transcode qua Server-Sent Events.
 * Trả về EventSource để caller tự đóng khi rời trang.
 */
export const subscribeProgress = (jobId, onProgress, onDone) => {
  const base = import.meta.env.VITE_API_URL || '/api';
  const es = new EventSource(`${base}/upload/${jobId}/progress`);
  es.onmessage = (e) => {
    const data = JSON.parse(e.data);
    onProgress?.(data);
    if (data.status === 'completed' || data.status === 'failed') {
      onDone?.(data);
      es.close();
    }
  };
  es.onerror = () => es.close();
  return es;
};
