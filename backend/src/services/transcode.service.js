const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const os = require('os');
const ffmpeg = require('fluent-ffmpeg');

const { env } = require('../config/env');
const { HLS_VARIANTS, HLS_SEGMENT_SECONDS } = require('../utils/constants');
const logger = require('../utils/logger');

if (env.FFMPEG_PATH) ffmpeg.setFfmpegPath(env.FFMPEG_PATH);
if (env.FFPROBE_PATH) ffmpeg.setFfprobePath(env.FFPROBE_PATH);

/** Thư mục làm việc tạm cho một job, gọi cleanupDir khi xong. */
async function createWorkDir(prefix = 'tiktak-') {
  return fsp.mkdtemp(path.join(env.TMP_DIR || os.tmpdir(), prefix));
}

async function cleanupDir(dir) {
  if (!dir) return;
  await fsp.rm(dir, { recursive: true, force: true }).catch(() => {});
}

/** Đọc metadata video bằng ffprobe. */
function getMetadata(filePath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, data) => {
      if (err) return reject(err);
      const videoStream = data.streams.find((s) => s.codec_type === 'video');
      const audioStream = data.streams.find((s) => s.codec_type === 'audio');
      const [num, den] = (videoStream?.r_frame_rate || '0/1').split('/').map(Number);
      resolve({
        durationMs: Math.round((data.format.duration || 0) * 1000),
        sizeBytes: Number(data.format.size || 0),
        width: videoStream?.width || 0,
        height: videoStream?.height || 0,
        fps: den ? Math.round(num / den) : 0,
        videoCodec: videoStream?.codec_name || null,
        audioCodec: audioStream?.codec_name || null,
        hasAudio: Boolean(audioStream),
      });
    });
  });
}

/** Chỉ giữ các mức chất lượng không vượt quá độ phân giải gốc. */
function pickVariants(sourceHeight) {
  const usable = HLS_VARIANTS.filter((v) => v.height <= (sourceHeight || 0));
  return usable.length ? usable : [HLS_VARIANTS[0]];
}

function runFfmpeg(command, label) {
  return new Promise((resolve, reject) => {
    command
      .on('start', (cmd) => logger.debug(`[ffmpeg:${label}] ${cmd}`))
      .on('error', (err) => reject(new Error(`ffmpeg ${label} lỗi: ${err.message}`)))
      .on('end', resolve)
      .run();
  });
}

/**
 * Transcode sang HLS nhiều mức chất lượng.
 * Mỗi variant nằm trong thư mục con riêng, kèm master.m3u8 ở gốc.
 * onProgress(percent) được gọi trong khoảng 0..100.
 */
async function transcodeToHLS(inputPath, outputDir, onProgress) {
  const meta = await getMetadata(inputPath);
  const variants = pickVariants(meta.height);
  await fsp.mkdir(outputDir, { recursive: true });

  for (let i = 0; i < variants.length; i += 1) {
    const variant = variants[i];
    const variantDir = path.join(outputDir, variant.name);
    await fsp.mkdir(variantDir, { recursive: true });

    const command = ffmpeg(inputPath)
      .videoCodec('libx264')
      .audioCodec('aac')
      .outputOptions([
        '-preset veryfast',
        '-profile:v main',
        '-sc_threshold 0',
        '-g 48',
        '-keyint_min 48',
        `-b:v ${variant.videoBitrate}`,
        `-maxrate ${variant.videoBitrate}`,
        `-bufsize ${parseInt(variant.videoBitrate, 10) * 2}k`,
        `-b:a ${variant.audioBitrate}`,
        `-vf scale=-2:${variant.height}`,
        '-f hls',
        `-hls_time ${HLS_SEGMENT_SECONDS}`,
        '-hls_playlist_type vod',
        `-hls_segment_filename ${path.join(variantDir, 'seg_%03d.ts')}`,
      ])
      .output(path.join(variantDir, 'index.m3u8'));

    if (onProgress) {
      command.on('progress', (p) => {
        const within = Math.min(100, Math.max(0, p.percent || 0));
        onProgress(Math.round(((i + within / 100) / variants.length) * 100));
      });
    }

    await runFfmpeg(command, `hls-${variant.name}`);
  }

  const master = [
    '#EXTM3U',
    '#EXT-X-VERSION:3',
    ...variants.flatMap((v) => [
      `#EXT-X-STREAM-INF:BANDWIDTH=${v.bandwidth},RESOLUTION=${v.width}x${v.height}`,
      `${v.name}/index.m3u8`,
    ]),
  ].join('\n');
  const masterPath = path.join(outputDir, 'master.m3u8');
  await fsp.writeFile(masterPath, `${master}\n`, 'utf8');

  onProgress?.(100);
  return { masterPath, outputDir, variants: variants.map((v) => v.name), metadata: meta };
}

/** Trích một khung hình làm thumbnail. */
async function extractThumbnail(inputPath, outputPath, timestampSec = 1) {
  await fsp.mkdir(path.dirname(outputPath), { recursive: true });
  await new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .screenshots({
        timestamps: [timestampSec],
        filename: path.basename(outputPath),
        folder: path.dirname(outputPath),
        size: '720x?',
      })
      .on('error', reject)
      .on('end', resolve);
  });
  return outputPath;
}

/**
 * Tách audio sang WAV 16kHz mono - định dạng Whisper yêu cầu.
 * Đây là bước đầu vào của pipeline lồng tiếng.
 */
async function extractAudio(inputPath, outputPath) {
  await fsp.mkdir(path.dirname(outputPath), { recursive: true });
  await runFfmpeg(
    ffmpeg(inputPath).noVideo().audioCodec('pcm_s16le').audioFrequency(16000).audioChannels(1).output(outputPath),
    'extract-audio'
  );
  return outputPath;
}

/**
 * Ghép audio đã lồng tiếng vào video gốc, giữ nguyên hình.
 * Dùng -shortest để tránh lệch độ dài khi audio dịch dài hơn.
 */
async function muxAudioIntoVideo(videoPath, audioPath, outputPath) {
  await fsp.mkdir(path.dirname(outputPath), { recursive: true });
  await runFfmpeg(
    ffmpeg()
      .input(videoPath)
      .input(audioPath)
      .outputOptions(['-map 0:v:0', '-map 1:a:0', '-c:v copy', '-c:a aac', '-shortest'])
      .output(outputPath),
    'mux-audio'
  );
  return outputPath;
}

/** Kiểm tra ffmpeg có sẵn không, gọi lúc khởi động để báo sớm. */
function checkFfmpegAvailable() {
  return new Promise((resolve) => {
    ffmpeg.getAvailableFormats((err) => resolve(!err));
  });
}

module.exports = {
  createWorkDir,
  cleanupDir,
  getMetadata,
  transcodeToHLS,
  extractThumbnail,
  extractAudio,
  muxAudioIntoVideo,
  checkFfmpegAvailable,
  pickVariants,
};
