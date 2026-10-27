const mongoose = require('mongoose');
const AudioTrack = require('../models/AudioTrack');
const Video = require('../models/Video');
const { success, error } = require('../utils/apiResponse');
const { dubbingQueue } = require('../jobs/queue');
const { SUPPORTED_LANGS } = require('../utils/constants');

const LANG_CODES = SUPPORTED_LANGS.map((l) => l.code);

const isStaff = (user) => user && (user.role === 'admin' || user.role === 'moderator');

exports.requestDubbing = async (req, res) => {
  const { videoId, targetLang, sourceLang = 'vi' } = req.body || {};

  if (!mongoose.Types.ObjectId.isValid(videoId)) return error(res, 'Invalid videoId', 400);
  if (!LANG_CODES.includes(targetLang)) {
    return error(res, `targetLang không hợp lệ. Hỗ trợ: ${LANG_CODES.join(', ')}`, 400);
  }
  if (!LANG_CODES.includes(sourceLang)) return error(res, 'sourceLang không hợp lệ', 400);
  if (sourceLang === targetLang) return error(res, 'sourceLang và targetLang phải khác nhau', 400);

  const video = await Video.findById(videoId).select('userId status').lean();
  if (!video) return error(res, 'Video not found', 404);
  // Chỉ chủ video (hoặc admin/moderator) được yêu cầu lồng tiếng — tác vụ AI tốn tài nguyên
  if (String(video.userId) !== String(req.user._id) && !isStaff(req.user)) {
    return error(res, 'Bạn chỉ có thể lồng tiếng video của mình', 403);
  }
  if (video.status !== 'ready') return error(res, 'Video chưa xử lý xong', 409);

  const existing = await AudioTrack.findOne({ videoId, targetLang });
  if (existing && existing.status === 'done') return success(res, existing, 200, 'Đã có bản dịch');
  if (existing && !['failed', 'done'].includes(existing.status)) {
    return success(res, { trackId: existing._id, jobId: existing.jobId, status: existing.status }, 202, 'Đang xử lý lồng tiếng');
  }

  const track = await AudioTrack.findOneAndUpdate(
    { videoId, targetLang },
    { sourceLang, status: 'pending', error: null },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  // attempts/backoff đã được cấu hình mặc định trong jobs/queue.js
  const job = await dubbingQueue.add('dubbing', { audioTrackId: track._id.toString() });
  track.jobId = job.id;
  await track.save();
  success(res, { trackId: track._id, jobId: job.id, status: 'pending' }, 202, 'Đang xử lý lồng tiếng');
};

exports.getDubbingStatus = async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.trackId)) return error(res, 'Invalid trackId', 400);
  const track = await AudioTrack.findById(req.params.trackId);
  if (!track) return error(res, 'Track not found', 404);
  success(res, track);
};

exports.getVideoTracks = async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.videoId)) return error(res, 'Invalid videoId', 400);
  // Trả cả track đang xử lý để frontend hiển thị trạng thái
  const tracks = await AudioTrack.find({ videoId: req.params.videoId }).select('-transcript');
  success(res, tracks);
};

// GET /api/dubbing/health — kiểm tra nhanh AI service có chạy không
exports.getAiHealth = async (req, res) => {
  const { health } = require('../services/ai/aiClient');
  success(res, await health());
};

exports.getSupportedLanguages = async (req, res) => {
  success(res, SUPPORTED_LANGS);
};
