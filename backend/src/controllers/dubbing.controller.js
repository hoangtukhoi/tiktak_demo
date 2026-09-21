const AudioTrack = require('../models/AudioTrack');
const Video = require('../models/Video');
const subtitleService = require('../services/subtitle.service');
const aiClient = require('../services/ai/aiClient');
const { dubbingQueue } = require('../jobs/queue');
const { success, error } = require('../utils/apiResponse');
const { SUPPORTED_LANGS } = require('../utils/constants');

/**
 * Yêu cầu lồng tiếng cho một video.
 * Kết quả được cache theo cặp (videoId, targetLang): nếu đã có bản "done"
 * thì trả về ngay, không xử lý lại. Truyền force=true để buộc chạy lại.
 */
exports.requestDubbing = async (req, res) => {
  const { videoId, targetLang, sourceLang, force } = req.body;

  const video = await Video.findOne({ _id: videoId, isDeleted: false }).select(
    'status userId originalLang originalKey hasAudio'
  );
  if (!video) return error(res, 'Không tìm thấy video', 404);
  if (video.status !== 'ready') return error(res, 'Video chưa xử lý xong, hãy thử lại sau', 409);
  if (video.hasAudio === false) return error(res, 'Video này không có âm thanh để lồng tiếng', 400);

  const existing = await AudioTrack.findOne({ videoId, targetLang });

  if (existing && existing.status === 'done' && !force) {
    return success(res, existing, 200, 'Đã có sẵn bản lồng tiếng');
  }
  if (existing && ['pending', 'extracting', 'transcribing', 'translating', 'synthesizing'].includes(existing.status) && !force) {
    return success(res, existing, 202, 'Video đang được xử lý');
  }

  const track = await AudioTrack.findOneAndUpdate(
    { videoId, targetLang },
    {
      sourceLang: sourceLang || video.originalLang || 'auto',
      requestedBy: req.user._id,
      status: 'pending',
      progress: 0,
      statusMessage: 'Đang xếp hàng chờ xử lý',
      error: null,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const job = await dubbingQueue.add('dubbing', { audioTrackId: track._id.toString() });
  track.jobId = job.id;
  await track.save();

  success(res, { trackId: track._id, jobId: job.id, status: track.status }, 202, 'Đã đưa vào hàng đợi xử lý');
};

exports.getDubbingStatus = async (req, res) => {
  const track = await AudioTrack.findById(req.params.trackId).lean();
  if (!track) return error(res, 'Không tìm thấy bản lồng tiếng', 404);
  success(res, track);
};

/** Danh sách bản lồng tiếng + phụ đề của một video, dùng cho menu chọn ngôn ngữ trên player. */
exports.getVideoTracks = async (req, res) => {
  const [tracks, subtitles] = await Promise.all([
    AudioTrack.find({ videoId: req.params.videoId })
      .select('targetLang sourceLang status progress audioUrl subtitleUrl dubbedVideoUrl updatedAt')
      .lean(),
    subtitleService.getSubtitles(req.params.videoId),
  ]);

  success(res, {
    audioTracks: tracks.map((t) => ({
      ...t,
      langLabel: subtitleService.langLabel(t.targetLang),
    })),
    subtitles,
  });
};

exports.getSupportedLanguages = async (req, res) => {
  success(res, SUPPORTED_LANGS);
};

/** Kiểm tra AI service có sẵn sàng không, hữu ích khi demo và khi debug. */
exports.getServiceHealth = async (req, res) => {
  success(res, await aiClient.health());
};

exports.deleteTrack = async (req, res) => {
  const track = await AudioTrack.findById(req.params.trackId);
  if (!track) return error(res, 'Không tìm thấy bản lồng tiếng', 404);

  const video = await Video.findById(track.videoId).select('userId');
  const isOwner = video && String(video.userId) === String(req.user._id);
  if (!isOwner && req.user.role !== 'admin') return error(res, 'Bạn không có quyền xoá', 403);

  await Video.findByIdAndUpdate(track.videoId, { $pull: { audioTracks: track._id } });
  await track.deleteOne();
  success(res, null, 200, 'Đã xoá bản lồng tiếng');
};
