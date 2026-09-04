const AudioTrack = require('../models/AudioTrack');
const { success, error } = require('../utils/apiResponse');
const { dubbingQueue } = require('../jobs/queue');
exports.requestDubbing = async (req, res) => {
  const { videoId, targetLang, sourceLang } = req.body;
  const existing = await AudioTrack.findOne({ videoId, targetLang });
  if (existing && existing.status === 'done') return success(res, existing, 200, 'Đã có bản dịch');
  const track = await AudioTrack.findOneAndUpdate(
    { videoId, targetLang },
    { sourceLang: sourceLang || 'vi', status: 'pending', error: null },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  const job = await dubbingQueue.add('dubbing', { audioTrackId: track._id.toString() }, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 10000 },
  });
  track.jobId = job.id;
  await track.save();
  success(res, { trackId: track._id, jobId: job.id, status: 'pending' }, 202, 'Đang xử lý lồng tiếng');
};
exports.getDubbingStatus = async (req, res) => {
  const track = await AudioTrack.findById(req.params.trackId);
  if (!track) return error(res, 'Track not found', 404);
  success(res, track);
};
exports.getVideoTracks = async (req, res) => {
  const tracks = await AudioTrack.find({ videoId: req.params.videoId });
  success(res, tracks);
};
exports.getSupportedLanguages = async (req, res) => {
  const { SUPPORTED_LANGS } = require('../utils/constants');
  success(res, SUPPORTED_LANGS);
};