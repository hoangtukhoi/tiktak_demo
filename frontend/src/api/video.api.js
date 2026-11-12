import api, { API_URL, USE_MOCK } from './axiosClient';

const d = (r) => r.data.data;

/**
 * Chuẩn hoá Video theo model backend (models/Video.js).
 * - feed (aggregate) trả userId đã $lookup, getVideo/search trả userId đã populate {username, avatarUrl}
 * - src: hlsUrl (master.m3u8) -> originalUrl
 * - visibility: public | friends | private (video cũ chỉ có isPrivate -> suy ra)
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
    repostCount: v.repostCount ?? 0,
    viewCount: v.viewCount ?? 0,
    isLiked: !!v.isLiked,
    isSaved: !!v.isSaved,
    isReposted: !!v.isReposted,
    canRepost: v.canRepost !== false, // tác giả cho phép đăng lại (quyền riêng tư)
    commentPolicy: v.commentPolicy || null, // { allowed, reason } — chỉ có ở trang chi tiết video
    // Người mình theo dõi đã đăng lại video này (tối đa 3) + tổng số
    repostedBy: v.repostedBy || [],
    repostedByCount: v.repostedByCount ?? (v.repostedBy?.length || 0),
    mentions: v.mentions || [],
    visibility: v.visibility || (v.isPrivate ? 'private' : 'public'),
  };
};
const list = (r) => (d(r) || []).map(normalizeVideo);
/** Trang có phân trang -> { videos, nextCursor } (cursor = số trang 0, 1, 2...) */
const page = (r) => ({ videos: list(r), nextCursor: r.data.pagination?.nextCursor ?? null });

// Feed
export const getForYouFeed = (cursor) => api.get('/feed/for-you', { params: { cursor } }).then(list);
export const getFollowingFeed = (cursor) => api.get('/feed/following', { params: { cursor } }).then(list);

// Video
export const getVideo = (id) => api.get(`/videos/${id}`).then((r) => normalizeVideo(d(r)));
export const createVideo = (data) => api.post('/videos', data).then((r) => normalizeVideo(d(r)));
/** PATCH /videos/:id — title, description, hashtags, visibility, allowComment, allowDuet */
export const updateVideo = (id, data) => api.patch(`/videos/${id}`, data).then((r) => normalizeVideo(d(r)));
export const deleteVideo = (id) => api.delete(`/videos/${id}`);
export const likeVideo = (id) => api.post(`/videos/${id}/like`).then(d); // -> { isLiked, likeCount }
export const saveVideo = (id) => api.post(`/videos/${id}/save`).then(d); // -> { isSaved, saveCount }
/** Ghim / bỏ ghim video lên đầu hồ sơ (tối đa 3) -> { pinned, pinnedAt } */
export const togglePinVideo = (id) => api.post(`/videos/${id}/pin`).then(d);
/** Đăng lại / bỏ đăng lại -> { reposted, repostCount } */
export const toggleRepost = (id) => api.post(`/videos/${id}/repost`).then(d);
/** Ghi 1 lượt chia sẻ (mỗi tài khoản chỉ được tính 1 lần / video) -> { shareCount, counted } */
export const shareVideo = (id, method = 'other') => api.post(`/videos/${id}/share`, { method }).then(d);
/** Báo cáo video. reason: một trong REPORT_REASONS (utils/constants.js) */
export const reportVideo = (id, reason, note) => api.post(`/videos/${id}/report`, { reason, note }).then(d);
export const searchVideos = (q, cursor) => api.get('/videos/search', { params: { q, cursor } }).then(list);
/** Gợi ý người để tag khi gõ "@" */
export const mentionSuggest = (q) => api.get('/users/mention-suggest', { params: { q } }).then((r) => d(r) || []);

/**
 * Ghi 1 lượt xem khi người xem rời video: { watchTimeMs, durationMs, completed, source }.
 * Dùng fetch `keepalive` để request vẫn được gửi khi đóng tab / chuyển trang.
 * source: for_you | following | profile | search | direct
 */
export const recordView = (id, data = {}) => {
  if (USE_MOCK) return api.post(`/videos/${id}/view`, data);
  const token = localStorage.getItem('accessToken');
  return fetch(`${API_URL}/videos/${id}/view`, {
    method: 'POST',
    keepalive: true,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(data),
  });
};

// Theo người dùng (userId hoặc username đều được)
/** sort: latest | popular. Video ghim luôn đứng đầu khi sort = latest */
export const getUserVideos = (userId, { cursor, sort } = {}) =>
  api.get(`/users/${userId}/videos`, { params: { cursor, sort } }).then(page);
/** Video đã thích (theo cài đặt quyền riêng tư của người đó; bị ẩn -> lỗi 403 code PRIVATE) */
export const getLikedVideos = (userId, cursor) => api.get(`/users/${userId}/liked`, { params: { cursor } }).then(page);
/** Video đã đăng lại */
export const getUserReposts = (userId, cursor) => api.get(`/users/${userId}/reposts`, { params: { cursor } }).then(page);
/** Chỉ chủ tài khoản */
export const getSavedVideos = (cursor) => api.get('/users/me/saved', { params: { cursor } }).then(page);
export const getDrafts = (cursor) => api.get('/users/me/drafts', { params: { cursor } }).then(page);

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

// Comments — model Comment dùng `content`
export const normalizeComment = (c) => ({
  ...c,
  text: c.content ?? c.text ?? '',
  user: c.userId && typeof c.userId === 'object' ? c.userId : c.user || { _id: c.userId, username: 'user' },
  likeCount: c.likeCount ?? 0,
  replyCount: c.replyCount ?? 0,
  isLiked: !!c.isLiked,
  mentions: c.mentions || [],
  // approved | pending (chờ duyệt) | rejected (bị ẩn) — bình luận cũ không có trường này
  moderationStatus: c.moderationStatus || 'approved',
});
export const getComments = (videoId) => api.get(`/comments/video/${videoId}`).then((r) => (d(r) || []).map(normalizeComment));
export const getReplies = (commentId) => api.get(`/comments/${commentId}/replies`).then((r) => (d(r) || []).map(normalizeComment));
export const createComment = (videoId, text, parentId) =>
  api.post('/comments', { videoId, content: text, parentId }).then((r) => ({ ...normalizeComment(d(r)), _message: r.data.message }));
export const deleteComment = (id) => api.delete(`/comments/${id}`);
export const likeComment = (id) => api.post(`/comments/${id}/like`).then(d);
/** Báo cáo bình luận (mỗi người 1 lần / bình luận) */
export const reportComment = (id, reason, note) => api.post(`/comments/${id}/report`, { reason, note }).then(d);
