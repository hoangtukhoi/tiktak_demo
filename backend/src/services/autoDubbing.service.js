/**
 * Lồng tiếng tự động các ngôn ngữ người đăng chọn lúc tải lên (Video.dubLangs).
 * Gọi khi video xử lý xong (transcode job) hoặc khi bản nháp được đăng.
 */
/** Bỏ qua ngôn ngữ đã có bản lồng tiếng / đang xử lý */
async function queueAutoDubbing(video) {
  const AudioTrack = require('../models/AudioTrack');
  const { dubbingQueue } = require('../jobs/queue');
  for (const targetLang of video.dubLangs) {
    if (targetLang === video.sourceLang) continue;
    // eslint-disable-next-line no-await-in-loop
    const existing = await AudioTrack.findOne({ videoId: video._id, targetLang }).select('_id').lean();
    if (existing) continue;
    let track;
    try {
      // eslint-disable-next-line no-await-in-loop
      track = await AudioTrack.create({ videoId: video._id, sourceLang: video.sourceLang || 'vi', targetLang, status: 'pending' });
    } catch (err) {
      if (err.code === 11000) continue; // trình duyệt vừa yêu cầu cùng ngôn ngữ
      throw err;
    }
    // eslint-disable-next-line no-await-in-loop
    const job = await dubbingQueue.add('dubbing', { audioTrackId: track._id.toString() });
    // eslint-disable-next-line no-await-in-loop
    await AudioTrack.updateOne({ _id: track._id }, { jobId: job.id });
  }
}

module.exports = { queueAutoDubbing };
