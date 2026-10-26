import api, { API_URL } from './axiosClient';

const d = (r) => r.data.data;

/**
 * Chuẩn hoá Video theo model backend (models/Video.js).
 * - feed (aggregate) trả userId dạng ObjectId, getVideo/search trả userId đã populate {username, avatarUrl}
 * - src: hlsUrl (master.m3u8) -> originalUrl
 */
export const normalizeVideo = (v) => {
  if (!v) return v;
  const u = v.userId && typeof v.userId === 'object' ? v.userId : v.author || { _id: v.userId };
  return {
    ...v,
    author: { _id: u._id, username: u.username || 'user', avatarUrl: u.avatarUrl || null, isVerified: !!u.isVerified },
    src: v.hlsUrl || v.originalUrl || null,
    hashtags: v.hashtags || [],
    likeCount: v.likeCount ?? 0,
    commentCount: v.commentCount ?? 0,
    shareCount: v.shareCount ?? 0,
    viewCount: v.viewCount ?? 0,
    isLiked: !!v.isLiked,
  };
};
const list = (r) => (d(r) || []).map(normalizeVideo);

// Feed — backend chưa phân trang theo cursor, nhưng vẫn gửi để tương thích về sau
export const getForYouFeed = (cursor) => api.get('/feed/for-you', { params: { cursor } }).then(list);
export const getFollowingFeed = (cursor) => api.get('/feed/following', { params: { cursor } }).then(list);

// Video
export const getVideo = (id) => api.get(`/videos/${id}`).then((r) => normalizeVideo(d(r)));
export const createVideo = (data) => api.post('/videos', data).then((r) => normalizeVideo(d(r)));
export const updateVideo = (id, data) => api.patch(`/videos/${id}`, data).then((r) => normalizeVideo(d(r)));
export const deleteVideo = (id) => api.delete(`/videos/${id}`);
export const likeVideo = (id) => api.post(`/videos/${id}/like`).then(d); // backend hiện trả null -> UI tự toggle
export const recordView = (id, watchTimeMs) => api.post(`/videos/${id}/view`, { watchTimeMs });
export const searchVideos = (q, page = 1) => api.get('/videos/search', { params: { q, page } }).then(list);
export const getUserVideos = (userId, cursor) => api.get(`/users/${userId}/videos`, { params: { cursor } }).then(list);

/**
 * Upload file theo README (multipart + tiến trình transcode qua SSE).
 * Trả về { videoId, jobId }. Backend hiện CHƯA có route /upload -> trang Upload tự fallback sang POST /videos.
 */
export const uploadVideoFile = (formData, onProgress) =>
  api.post('/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (e) => e.total && onProgress?.(Math.round((e.loaded / e.total) * 100)),
  }).then(d);

/** SSE: GET /upload/:jobId/progress -> { status, progress, step } ; EventSource không gửi header nên kèm token qua query */
export const getProgressSSE = (jobId, onProgress, onDone, onError) => {
  const token = localStorage.getItem('accessToken') || '';
  const es = new EventSource(`${API_URL}/upload/${jobId}/progress?token=${encodeURIComponent(token)}`);
  es.onmessage = (e) => {
    const data = JSON.parse(e.data);
    onProgress?.(data);
    if (data.status === 'completed' || data.status === 'failed') { es.close(); onDone?.(data); }
  };
  es.onerror = () => { es.close(); onError?.(); };
  return es;
};

// Comments — model Comment dùng `content`, controller đọc `text` -> gửi cả hai
export const normalizeComment = (c) => ({
  ...c,
  text: c.content ?? c.text ?? '',
  user: c.userId && typeof c.userId === 'object' ? c.userId : c.user || { _id: c.userId, username: 'user' },
  likeCount: c.likeCount ?? 0,
  replyCount: c.replyCount ?? 0,
});
export const getComments = (videoId) => api.get(`/comments/video/${videoId}`).then((r) => (d(r) || []).map(normalizeComment));
export const getReplies = (commentId) => api.get(`/comments/${commentId}/replies`).then((r) => (d(r) || []).map(normalizeComment));
export const createComment = (videoId, text, parentId) =>
  api.post('/comments', { videoId, text, content: text, parentId }).then((r) => normalizeComment(d(r)));
export const deleteComment = (id) => api.delete(`/comments/${id}`);
export const likeComment = (id) => api.post(`/comments/${id}/like`).then(d);
