const fsp = require('fs/promises');
const path = require('path');

const AudioTrack = require('../../models/AudioTrack');
const Video = require('../../models/Video');
const transcodeService = require('../transcode.service');
const storageService = require('../storage.service');
const subtitleService = require('../subtitle.service');
const notificationService = require('../notification.service');
const { transcribe } = require('./speechToText.service');
const { translateSegments } = require('./translation.service');
const { synthesizeSegments } = require('./textToSpeech.service');
const { emitToUser, emitToVideo } = require('../../sockets/notification.socket');
const { NOTIFICATION_TYPES, SOCKET_EVENTS, SUPPORTED_LANGS } = require('../../utils/constants');
const logger = require('../../utils/logger');

const langLabel = (code) => SUPPORTED_LANGS.find((l) => l.code === code)?.name || code;

/**
 * Pipeline dịch và lồng tiếng.
 *
 *   video gốc
 *     -> tách audio WAV 16kHz          (ffmpeg)
 *     -> nhận dạng lời thoại + mốc giờ (Whisper)
 *     -> dịch từng segment             (NLLB / SeamlessM4T)
 *     -> sinh phụ đề VTT hai ngôn ngữ
 *     -> tổng hợp giọng nói ngôn ngữ đích, khớp thời lượng (TTS)
 *     -> ghép audio mới vào video gốc  (ffmpeg)
 *     -> upload S3, cập nhật AudioTrack, thông báo cho chủ video
 *
 * Mọi bước đều ghi lại status + progress để client theo dõi realtime.
 */
async function runDubbingPipeline(audioTrackId, onProgress) {
  const startedAt = Date.now();
  const track = await AudioTrack.findById(audioTrackId);
  if (!track) throw new Error(`Không tìm thấy AudioTrack ${audioTrackId}`);

  const video = await Video.findById(track.videoId);
  if (!video) throw new Error(`Không tìm thấy video ${track.videoId}`);
  if (!video.originalKey) throw new Error('Video chưa có file gốc để xử lý');

  const workDir = await transcodeService.createWorkDir('dubbing-');

  const report = async (status, percent, message) => {
    track.status = status;
    track.progress = percent;
    track.statusMessage = message;
    await track.save();
    onProgress?.(percent, message);
    const payload = {
      trackId: String(track._id),
      videoId: String(video._id),
      targetLang: track.targetLang,
      status,
      progress: percent,
      message,
    };
    emitToUser(video.userId, SOCKET_EVENTS.DUBBING_PROGRESS, payload);
    emitToVideo(video._id, SOCKET_EVENTS.DUBBING_PROGRESS, payload);
  };

  try {
    // 1. Tách audio từ file gốc.
    await report('extracting', 5, 'Đang tách âm thanh từ video');
    const sourcePath = path.join(workDir, `source${path.extname(video.originalKey) || '.mp4'}`);
    await storageService.downloadToFile(storageService.BUCKETS.VIDEOS, video.originalKey, sourcePath);

    const audioPath = path.join(workDir, 'audio.wav');
    await transcodeService.extractAudio(sourcePath, audioPath);
    const audioUrl = await storageService.uploadFile(
      `${video._id}/audio/source.wav`,
      audioPath,
      storageService.BUCKETS.AUDIO
    );

    // 2. Nhận dạng lời thoại.
    await report('transcribing', 20, 'Đang nhận dạng lời thoại');
    const stt = await transcribe(audioUrl, track.sourceLang === 'auto' ? null : track.sourceLang);
    if (!stt.segments.length) throw new Error('Không nhận dạng được lời thoại trong video');

    track.transcript = stt.text;
    track.segments = stt.segments;
    track.detectedLang = stt.language;
    track.durationMs = Math.round(stt.duration * 1000);
    track.modelVersion = stt.modelVersion;
    const sourceLang = track.sourceLang === 'auto' ? stt.language || 'en' : track.sourceLang;
    track.sourceLang = sourceLang;
    await track.save();

    // Phụ đề ngôn ngữ gốc tái sử dụng được cho mọi bản dịch sau này.
    await subtitleService.createSubtitle(video._id, sourceLang, stt.segments, { isOriginal: true });

    // 3. Dịch từng segment.
    await report('translating', 45, `Đang dịch sang ${langLabel(track.targetLang)}`);
    const translated = await translateSegments(stt.segments, sourceLang, track.targetLang);
    track.segments = translated;
    track.translatedText = translated.map((s) => s.translatedText).join(' ');
    await track.save();

    // 4. Phụ đề ngôn ngữ đích.
    await report('translating', 60, 'Đang tạo phụ đề');
    const subtitle = await subtitleService.createSubtitle(
      video._id,
      track.targetLang,
      translated,
      { textKey: 'translatedText' }
    );
    track.subtitleUrl = subtitle.url;
    await track.save();

    // 5. Tổng hợp giọng nói.
    await report('synthesizing', 70, 'Đang tổng hợp giọng nói');
    const tts = await synthesizeSegments(translated, track.targetLang, {
      speakerAudioUrl: audioUrl,
      totalDurationSec: (video.durationMs || track.durationMs) / 1000,
    });

    const dubbedAudioPath = path.join(workDir, `dubbed.${tts.format}`);
    await fsp.writeFile(dubbedAudioPath, tts.buffer);
    track.audioUrl = await storageService.uploadFile(
      `${video._id}/audio/${track.targetLang}.${tts.format}`,
      dubbedAudioPath,
      storageService.BUCKETS.AUDIO
    );
    await track.save();

    // 6. Ghép audio mới vào video gốc để người xem chọn bản lồng tiếng.
    await report('synthesizing', 88, 'Đang ghép âm thanh vào video');
    const dubbedVideoPath = path.join(workDir, `dubbed_${track.targetLang}.mp4`);
    await transcodeService.muxAudioIntoVideo(sourcePath, dubbedAudioPath, dubbedVideoPath);
    track.dubbedVideoUrl = await storageService.uploadFile(
      `${video._id}/dubbed/${track.targetLang}.mp4`,
      dubbedVideoPath,
      storageService.BUCKETS.VIDEOS
    );

    // 7. Hoàn tất.
    track.processingMs = Date.now() - startedAt;
    track.error = null;
    await report('done', 100, 'Hoàn tất');

    await Video.findByIdAndUpdate(video._id, { $addToSet: { audioTracks: track._id } });

    await notificationService.createNotification(video.userId, NOTIFICATION_TYPES.DUBBING_DONE, {
      videoId: video._id,
      videoThumbnail: video.thumbnailUrl,
      message: `Video của bạn đã có bản lồng tiếng ${langLabel(track.targetLang)}`,
    });

    logger.info(
      `Dubbing xong video ${video._id} -> ${track.targetLang} trong ${Math.round(track.processingMs / 1000)}s`
    );
    return track;
  } catch (err) {
    logger.error(`Dubbing thất bại (track ${audioTrackId}): ${err.message}`);
    track.status = 'failed';
    track.error = err.message;
    track.statusMessage = err.message;
    await track.save();
    emitToUser(video.userId, SOCKET_EVENTS.DUBBING_PROGRESS, {
      trackId: String(track._id),
      videoId: String(video._id),
      status: 'failed',
      progress: 100,
      message: err.message,
    });
    throw err;
  } finally {
    await transcodeService.cleanupDir(workDir);
  }
}

module.exports = { runDubbingPipeline };
