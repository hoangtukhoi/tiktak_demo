const path = require('path');
const os = require('os');
const fs = require('fs');
const fsp = require('fs/promises');
const { Worker } = require('bullmq');
const ffmpeg = require('fluent-ffmpeg');

const redis = require('../config/redis');
const Video = require('../models/Video');
const User = require('../models/User');
const storageService = require('../services/storage.service');
const notificationService = require('../services/notification.service');
const { emitToUser } = require('../sockets/notification.socket');
const { setProgress } = require('./queue');

// fluent-ffmpeg tự đọc biến môi trường FFMPEG_PATH / FFPROBE_PATH nếu ffmpeg
// không nằm trong PATH (Windows: VD C:\ffmpeg\bin\ffmpeg.exe).

// Cạnh ngắn tối đa của bản nén (720 = 720p). Đổi qua .env TRANSCODE_MAX_SIDE.
const MAX_SIDE = Number(process.env.TRANSCODE_MAX_SIDE) || 720;

let ffmpegAvailable = null;
async function checkFfmpeg() {
  if (ffmpegAvailable !== null) return ffmpegAvailable;
  ffmpegAvailable = await new Promise((resolve) => {
    ffmpeg.getAvailableFormats((err) => resolve(!err));
  });
  if (!ffmpegAvailable) {
    console.warn('[transcode] Không tìm thấy ffmpeg — video sẽ phát bằng file gốc (chậm). Cài ffmpeg hoặc đặt FFMPEG_PATH.');
  }
  return ffmpegAvailable;
}

function probe(file) {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(file, (err, data) => {
      if (err) return resolve(null);
      const vStream = data.streams?.find((s) => s.codec_type === 'video');
      // Video quay dọc trên điện thoại thường có rotate 90/270
      const rotation = Math.abs(Number(vStream?.tags?.rotate || vStream?.side_data_list?.[0]?.rotation || 0));
      const swap = rotation === 90 || rotation === 270;
      resolve({
        durationMs: Math.round((Number(data.format?.duration) || 0) * 1000),
        width: (swap ? vStream?.height : vStream?.width) || 0,
        height: (swap ? vStream?.width : vStream?.height) || 0,
        hasVideo: Boolean(vStream),
      });
    });
  });
}

/**
 * Nén về H.264/AAC, cạnh ngắn ≤ MAX_SIDE, `+faststart` để trình duyệt
 * phát được ngay khi mới tải vài trăm KB đầu (không phải chờ tải hết file).
 */
function transcodeMp4(input, output, onPercent) {
  // Giữ tỉ lệ, cạnh ngắn tối đa MAX_SIDE, kích thước chia hết cho 2 (yêu cầu của H.264)
  const scale =
    `scale='if(gte(iw,ih),-2,trunc(min(${MAX_SIDE},iw)/2)*2)':` +
    `'if(gte(iw,ih),trunc(min(${MAX_SIDE},ih)/2)*2,-2)'`;
  return new Promise((resolve, reject) => {
    ffmpeg(input)
      .outputOptions([
        '-map', '0:v:0',
        '-map', '0:a:0?',
        '-vf', scale,
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-crf', '24',
        '-profile:v', 'main',
        '-pix_fmt', 'yuv420p',
        '-maxrate', '2500k',
        '-bufsize', '5000k',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-ac', '2',
        '-movflags', '+faststart',
      ])
      .on('progress', (p) => p.percent && onPercent?.(Math.min(100, p.percent)))
      .on('end', resolve)
      .on('error', reject)
      .save(output);
  });
}

function extractThumbnail(input, folder) {
  return new Promise((resolve) => {
    ffmpeg(input)
      .screenshots({ timestamps: ['10%'], filename: 'thumb.jpg', folder, size: '540x?' })
      .on('end', () => resolve(path.join(folder, 'thumb.jpg')))
      .on('error', (err) => {
        console.warn('[ffmpeg] Thumbnail extraction failed:', err.message);
        resolve(null); // non-fatal
      });
  });
}

async function processTranscodeJob(job) {
  const { videoId, sourceKey, sourceBucket } = job.data;
  const video = await Video.findById(videoId);
  if (!video) throw new Error(`Không tìm thấy video ${videoId}`);
  if (video.status === 'deleted') return { videoId, status: 'deleted' };

  const report = async (percent, message) => {
    const p = Math.round(percent);
    await job.updateProgress(p);
    await setProgress(job.id, { status: 'processing', percent: p, message, videoId });
    emitToUser(video.userId, 'transcode:progress', { videoId, percent: p, message });
  };

  const workDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'tiktak-transcode-'));

  try {
    if (video.status !== 'ready') await Video.findByIdAndUpdate(videoId, { status: 'processing' });
    await report(5, 'Đang chuẩn bị xử lý video');

    const updates = {};
    let thumbnailUrl = video.thumbnailUrl || null;

    if ((await checkFfmpeg()) && sourceKey) {
      await report(10, 'Đang tải file video để xử lý');
      const localSource = path.join(workDir, 'source' + (path.extname(sourceKey) || '.mp4'));
      await storageService.downloadToFile(sourceBucket || storageService.BUCKETS.VIDEOS, sourceKey, localSource);

      await report(20, 'Đang đọc thông tin video');
      const meta = await probe(localSource);
      if (meta && !meta.hasVideo) throw new Error('File tải lên không có luồng video');

      await report(25, 'Đang tạo ảnh bìa');
      const thumbLocal = await extractThumbnail(localSource, workDir);
      if (thumbLocal && fs.existsSync(thumbLocal)) {
        thumbnailUrl = await storageService.uploadFile(
          `${videoId}/thumb-${Date.now()}.jpg`,
          thumbLocal,
          storageService.BUCKETS.THUMBNAILS,
          storageService.IMMUTABLE_CACHE
        );
      }

      await report(30, `Đang nén video ${MAX_SIDE}p`);
      const outLocal = path.join(workDir, 'out.mp4');
      try {
        let lastPct = -1;
        await transcodeMp4(localSource, outLocal, (pct) => {
          // Chỉ báo khi tăng ≥ 3% để không spam Redis/socket
          if (pct - lastPct < 3) return;
          lastPct = pct;
          // 30% → 85% dành cho bước nén; không await để không chặn ffmpeg
          report(30 + pct * 0.55, `Đang nén video ${MAX_SIDE}p (${Math.round(pct)}%)`).catch(() => {});
        });
        await report(88, 'Đang lưu bản đã nén');
        updates.hlsUrl = await storageService.uploadFile(
          `${videoId}/${MAX_SIDE}p-${Date.now()}.mp4`,
          outLocal,
          storageService.BUCKETS.VIDEOS,
          storageService.IMMUTABLE_CACHE
        );
        const outMeta = await probe(outLocal);
        const outStat = await fsp.stat(outLocal);
        Object.assign(updates, {
          durationMs: outMeta?.durationMs || meta?.durationMs || 0,
          width: outMeta?.width || meta?.width || 0,
          height: outMeta?.height || meta?.height || 0,
          sizeBytes: outStat.size,
        });
      } catch (encErr) {
        // Nén lỗi → vẫn cho video lên sóng bằng file gốc
        console.warn('[transcode] Encode failed, fallback to original:', encErr.message);
        if (meta) Object.assign(updates, { durationMs: meta.durationMs, width: meta.width, height: meta.height });
      }
    }

    if (!updates.hlsUrl) updates.hlsUrl = video.hlsUrl || video.originalUrl;
    if (!thumbnailUrl) thumbnailUrl = `https://picsum.photos/seed/${videoId}/540/960`;
    updates.thumbnailUrl = thumbnailUrl;

    await report(95, 'Đang cập nhật trạng thái');

    // Video lần đầu sẵn sàng: đặt ready + duyệt tự động + tăng videoCount (một lần).
    // Chạy lại (retry hoặc script retranscode) chỉ cập nhật URL/metadata,
    // không đụng tới moderationStatus (tránh "gỡ cờ" video đang bị flag/removed).
    const firstTime = video.status !== 'ready';
    const prev = await Video.findOneAndUpdate(
      { _id: videoId, status: { $ne: 'deleted' } },
      firstTime ? { ...updates, status: 'ready', moderationStatus: 'approved' } : updates
    );
    if (prev && prev.status !== 'ready') {
      await User.findByIdAndUpdate(video.userId, { $inc: { videoCount: 1 } });
    }

    await report(100, 'Xử lý video hoàn tất');
    await setProgress(job.id, {
      status: 'completed',
      percent: 100,
      message: 'Hoàn tất',
      videoId,
      url: updates.hlsUrl,
      thumbnailUrl,
    });

    if (prev && prev.status !== 'ready') {
      await notificationService
        .createNotification(video.userId, 'video_ready', {
          videoId: video._id,
          videoThumbnail: thumbnailUrl,
          message: `Video "${video.title}" của bạn đã xử lý xong và sẵn sàng hiển thị!`,
        })
        .catch(() => {});
    }

    return { videoId, status: 'ready', url: updates.hlsUrl };
  } catch (err) {
    console.error(`[transcode] Job ${job.id} failed:`, err.message);
    // Chỉ đánh dấu failed nếu video chưa từng ready (không làm hỏng video đang phát)
    await Video.updateOne(
      { _id: videoId, status: { $nin: ['ready', 'deleted'] } },
      { status: 'failed', flagReason: err.message }
    );
    await setProgress(job.id, { status: 'failed', percent: 100, message: err.message, videoId });
    emitToUser(video.userId, 'transcode:progress', {
      videoId,
      percent: 100,
      status: 'failed',
      message: err.message,
    });
    throw err;
  } finally {
    await fsp.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

let workerInstance = null;

function startTranscodeWorker() {
  if (workerInstance) return workerInstance;
  workerInstance = new Worker('video-transcode', processTranscodeJob, {
    connection: redis,
    // Nén video tốn CPU → mặc định 1 job một lúc
    concurrency: Number(process.env.TRANSCODE_CONCURRENCY) || 1,
    // Video dài có thể nén vài phút → tăng thời gian khoá job
    lockDuration: 10 * 60 * 1000,
  });

  workerInstance.on('completed', (job) => {
    console.log(`[Worker] Job transcode ${job.id} hoàn tất`);
  });

  workerInstance.on('failed', (job, err) => {
    console.error(`[Worker] Job transcode ${job?.id} thất bại:`, err.message);
  });

  return workerInstance;
}

module.exports = {
  startTranscodeWorker,
  processTranscodeJob,
  transcodeMp4,
  probe,
};
