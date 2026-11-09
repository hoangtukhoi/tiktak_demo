import api, { API_URL } from './axiosClient';

const d = (r) => r.data.data;

/**
 * Chuẩn hoá Video theo model backend (models/Video.js).
 * - feed (aggregate) trả userId dạng ObjectId, getVideo/search trả userId đã populate {username, avatarUrl}
 * - src: hlsUrl (master.m3u8) -> originalUrl
 * - visibility: public | friends | private (model hiện chỉ có isPrivate -> suy ra)
 */
export const normalizeVideo = (v) => {
  if (!v) return v;
  const u = v.userId && typeof v.userId === 'object' ? v.userId : v.author || { _id: v.userId };
  return {
    ...v,
    author: { _id: u._id, username: u.username || 'user', avatarUrl: u.avatarUrl || null, isVerified: !!u.isVerified, isFollowing: !!u.isFollowing },
    src: v.hlsUrl || v.originalUrl || null,
    hashtags: v.hashtags || [],
    likeCount: v.likeCount ?? 0,
    commentCount: v.commentCount ?? 0,
    shareCount: v.shareCount ?? 0,
    saveCount: v.saveCount ?? 0,
    viewCount: v.viewCount ?? 0,
    isLiked: !!v.isLiked,
    isSaved: !!v.isSaved,
    visibility: v.visibility || (v.isPrivate ? 'private' : 'public'),
  };
};
const list = (r) => (d(r) || []).map(normalizeVideo);

// Feed — backend chưa phân trang theo cursor, nhưng vẫn gửi để tương thích về sau
export const getForYouFeed = (cursor) => api.get('/feed/for-you', { params: { cursor } }).then(list);
export const getFollowingFeed = (cursor) => api.get('/feed/following', { params: { cursor } }).then(list);

// Video
export const getVideo = (id) => api.get(`/videos/${id}`).then((r) => normalizeVideo(d(r)));
export const createVideo = (data) => api.post('/videos', data).then((r) => normalizeVideo(d(r)));
/** PATCH /videos/:id — title, description, hashtags, isPrivate, visibility, allowComment, allowDuet */
export const updateVideo = (id, data) => api.patch(`/videos/${id}`, data).then((r) => normalizeVideo(d(r)));
export const deleteVideo = (id) => api.delete(`/videos/${id}`);
export const likeVideo = (id) => api.post(`/videos/${id}/like`).then(d);   // -> { isLiked, likeCount }
export const saveVideo = (id) => api.post(`/videos/${id}/save`).then(d);   // -> { isSaved, saveCount }
export const recordView = (id, watchTimeMs) => api.post(`/videos/${id}/view`, { watchTimeMs });
export const shareVideo = (id) => api.post(`/videos/${id}/share`).catch(() => {}); // tăng shareCount, lỗi thì bỏ qua
/** POST /videos/:id/report — tăng Video.reportCount; đủ ngưỡng thì moderationStatus = 'flagged' */
export const reportVideo = (id, reason, note) => api.post(`/videos/${id}/report`, { reason, note }).then(d);
export const searchVideos = (q, page = 1) => api.get('/videos/search', { params: { q, page } }).then(list);

// Theo người dùng
export const getUserVideos = (userId, { cursor, sort } = {}) =>
  api.get(`/users/${userId}/videos`, { params: { cursor, sort } }).then(list); // sort: latest | popular
export const getLikedVideos = (userId) => api.get(`/users/${userId}/liked`).then(list);
export const getSavedVideos = () => api.get('/users/me/saved').then(list);
export const getDrafts = () => api.get('/users/me/drafts').then(list);

/**
 * Upload file (multipart) + toàn bộ tuỳ chọn đăng:
 *   video (file), thumbnail (file jpg, ảnh bìa chọn ở client), title, description, hashtags (JSON),
 *   mentions (JSON userId[]), visibility, isPrivate, allowComment, allowDuet, scheduledAt (ISO),
 *   isDraft, sourceLang, autoCaption, dubLangs (JSON)
 * -> { videoId, jobId }. Tiến trình xử lý: SSE GET /upload/:jobId/progress
 */
export const uploadVideoFile = (formData, onProgress) =>
  api.post('/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (e) => e.total && onProgress?.(Math.round((e.loaded / e.total) * 100)),
  }).then(d);

/** SSE: { status, progress, step } ; EventSource không gửi header nên kèm token qua query */
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
  isLiked: !!c.isLiked,
});
export const getComments = (videoId) => api.get(`/comments/video/${videoId}`).then((r) => (d(r) || []).map(normalizeComment));
export const getReplies = (commentId) => api.get(`/comments/${commentId}/replies`).then((r) => (d(r) || []).map(normalizeComment));
export const createComment = (videoId, text, parentId) =>
  api.post('/comments', { videoId, text, content: text, parentId }).then((r) => normalizeComment(d(r)));
export const deleteComment = (id) => api.delete(`/comments/${id}`);
export const likeComment = (id) => api.post(`/comments/${id}/like`).then(d);
