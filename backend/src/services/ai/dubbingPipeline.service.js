const AudioTrack = require('../../models/AudioTrack');
const Subtitle = require('../../models/Subtitle');
const Video = require('../../models/Video');
const { transcribe } = require('./speechToText.service');
const { translate } = require('./translation.service');
const { synthesize } = require('./textToSpeech.service');
const notificationService = require('../notification.service');

exports.runDubbingPipeline = async (audioTrackId, onProgress) => {
  const track = await AudioTrack.findById(audioTrackId).populate('videoId');
  if (!track) throw new Error('AudioTrack not found');
  const video = track.videoId;

  try {
    onProgress?.(10, 'Đang nhận diện giọng nói...');
    track.status = 'transcribing';
    await track.save();
    const sttResult = await transcribe(video.originalUrl, track.sourceLang);
    track.transcript = sttResult.text;

    onProgress?.(40, 'Đang dịch...');
    track.status = 'translating';
    await track.save();
    track.translatedText = await translate(track.transcript, track.sourceLang, track.targetLang);

    onProgress?.(70, 'Đang tổng hợp giọng nói...');
    track.status = 'synthesizing';
    await track.save();
    track.audioUrl = await synthesize(track.translatedText, track.targetLang, video.originalUrl);

    onProgress?.(100, 'Hoàn tất!');
    track.status = 'done';
    await track.save();

    await Video.findByIdAndUpdate(video._id, { $addToSet: { audioTracks: track._id } });

    await notificationService.createNotification(video.userId, 'dubbing_done', {
      videoId: video._id,
      videoThumbnail: video.thumbnailUrl,
      message: `Video của bạn đã được lồng tiếng sang ${track.targetLang}`,
    });

    return track;
  } catch (err) {
    track.status = 'failed';
    track.error = err.message;
    await track.save();
    throw err;
  }
};