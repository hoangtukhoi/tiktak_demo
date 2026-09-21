import api from './axiosClient';

export const getComments = (videoId, cursor) =>
  api.get(`/comments/video/${videoId}`, { params: { cursor } }).then((r) => r.data.data);

export const getReplies = (commentId, cursor) =>
  api.get(`/comments/${commentId}/replies`, { params: { cursor } }).then((r) => r.data.data);

export const createComment = (videoId, content, parentId = null) =>
  api.post('/comments', { videoId, content, parentId }).then((r) => r.data.data);

export const deleteComment = (id) => api.delete(`/comments/${id}`);

export const likeComment = (id) => api.post(`/comments/${id}/like`).then((r) => r.data.data);
