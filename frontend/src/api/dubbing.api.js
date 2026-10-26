import api from './axiosClient';

const d = (r) => r.data.data;

// POST /dubbing/request -> 202 { trackId, jobId, status } | 200 AudioTrack (đã có bản dịch)
export const requestDubbing = (videoId, targetLang, sourceLang = 'vi') =>
  api.post('/dubbing/request', { videoId, targetLang, sourceLang }).then((r) => {
    const t = d(r);
    return { ...t, trackId: t.trackId || t._id };
  });
// AudioTrack: status pending|transcribing|translating|synthesizing|done|failed, translatedText, audioUrl, subtitleUrl
export const getDubbingStatus = (trackId) => api.get(`/dubbing/${trackId}/status`).then(d);
export const getVideoTracks = (videoId) => api.get(`/dubbing/video/${videoId}`).then(d);
export const getSupportedLanguages = () => api.get('/dubbing/languages').then(d); // [{ code, name }]
