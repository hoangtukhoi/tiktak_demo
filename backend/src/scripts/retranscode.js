/**
 * Nén lại các video cũ đang phát bằng file gốc (chưa có bản 720p).
 * Chạy: npm run retranscode            (chỉ video chưa nén)
 *       npm run retranscode -- --all   (nén lại toàn bộ video ready)
 * Cần worker đang chạy (npm run dev hoặc npm run worker) để xử lý job.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/database');
const redis = require('../config/redis');
const Video = require('../models/Video');
const storageService = require('../services/storage.service');
const { transcodeQueue } = require('../jobs/queue');

(async () => {
  await connectDB();
  if (redis.status === 'wait') await redis.connect();

  const all = process.argv.includes('--all');
  const query = { status: 'ready', originalUrl: { $ne: null } };
  if (!all) query.$expr = { $eq: ['$hlsUrl', '$originalUrl'] };

  const videos = await Video.find(query).select('_id originalUrl title').lean();
  let queued = 0;
  for (const v of videos) {
    const sourceKey = storageService.keyFromUrl(v.originalUrl, storageService.BUCKETS.VIDEOS);
    if (!sourceKey) {
      console.warn(`- Bỏ qua ${v._id}: không suy ra được key từ ${v.originalUrl}`);
      continue;
    }
    await transcodeQueue.add('transcode', {
      videoId: String(v._id),
      sourceKey,
      sourceBucket: storageService.BUCKETS.VIDEOS,
    });
    queued += 1;
    console.log(`+ ${v._id}  ${v.title}`);
  }
  console.log(`\nĐã đưa ${queued}/${videos.length} video vào hàng đợi nén.`);
  await mongoose.disconnect();
  await redis.quit();
  process.exit(0);
})().catch((err) => {
  console.error('retranscode failed:', err);
  process.exit(1);
});
