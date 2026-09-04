import api from './axiosClient';
export const requestDubbing = (videoId, targetLang, sourceLang) => api.post('/dubbing/request', { videoId, targetLang, sourceLang }).then(r => r.data.data);
export const getDubbingStatus = (trackId) => api.get(`/dubbing/${trackId}/status`).then(r => r.data.data);
export const getVideoTracks = (videoId) => api.get(`/dubbing/video/${videoId}`).then(r => r.data.data);
export const getSupportedLanguages = () => api.get('/dubbing/languages').then(r => r.data.data);
