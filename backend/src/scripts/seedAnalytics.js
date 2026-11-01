/**
 * Sinh dữ liệu DEMO cho trang phân tích (lượt xem + follow trong N ngày qua),
 * để biểu đồ có hình dạng khi trình bày. KHÔNG chạy trên dữ liệu thật.
 *
 *   npm run seed:analytics                 # 60 ngày, ~40 lượt xem/video/ngày tối đa
 *   npm run seed:analytics -- --days=30
 *   npm run seed:analytics -- --reset      # xoá toàn bộ ViewEvent/FollowEvent trước khi sinh
 *
 * Chỉ thêm ViewEvent/FollowEvent/ShareEvent/ProfileViewEvent, không sửa viewCount/likeCount của video.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/database');
const User = require('../models/User');
const Video = require('../models/Video');
const ViewEvent = require('../models/ViewEvent');
const FollowEvent = require('../models/FollowEvent');
const ProfileViewEvent = require('../models/ProfileViewEvent');
const ShareEvent = require('../models/ShareEvent');

const arg = (name, def) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? Number(hit.split('=')[1]) : def;
};
const DAYS = arg('days', 60);
const RESET = process.argv.includes('--reset');
const DAY = 86400000;

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const weighted = (pairs) => {
  const total = pairs.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [v, w] of pairs) if ((r -= w) <= 0) return v;
  return pairs[0][0];
};

// Giờ xem theo trọng số (đông vào trưa và tối, theo giờ VN)
const HOUR_WEIGHTS = [1, 0.5, 0.3, 0.2, 0.2, 0.4, 1, 2, 2.5, 2, 2, 2.5, 4, 3.5, 2.5, 2.5, 3, 4, 5, 6.5, 7.5, 7, 5, 2.5];
const SOURCES = [['for_you', 62], ['following', 14], ['profile', 10], ['search', 9], ['direct', 5]];

function eventTime(dayStart) {
  const hour = weighted(HOUR_WEIGHTS.map((w, h) => [h, w]));
  // dayStart là 00:00 giờ VN (UTC+7)
  return new Date(dayStart + hour * 3600000 + rand(0, 3600000));
}

(async () => {
  await connectDB();
  if (RESET) {
    const [v, f, p, s] = await Promise.all([
      ViewEvent.deleteMany({}), FollowEvent.deleteMany({}), ProfileViewEvent.deleteMany({}), ShareEvent.deleteMany({}),
    ]);
    console.log(`Đã xoá ${v.deletedCount} ViewEvent, ${f.deletedCount} FollowEvent, ${p.deletedCount} ProfileViewEvent, ${s.deletedCount} ShareEvent`);
  }

  const users = await User.find({ bannedAt: null }).select('_id').lean();
  const videos = await Video.find({ status: 'ready' }).select('_id userId durationMs createdAt').lean();
  if (!videos.length) {
    console.log('Chưa có video ready nào — chạy npm run seed trước.');
    process.exit(0);
  }

  const now = Date.now();
  const todayVN = Math.floor((now + 7 * 3600000) / DAY) * DAY - 7 * 3600000;
  const views = [];
  const shares = [];
  const profileViews = [];

  for (const v of videos) {
    const durMs = v.durationMs > 0 ? v.durationMs : rand(10, 60) * 1000;
    const popularity = rand(0.3, 1.5); // video "hot" hay không
    const hook = rand(0.35, 0.8); // khả năng giữ chân của video
    for (let d = DAYS - 1; d >= 0; d -= 1) {
      const dayStart = todayVN - d * DAY;
      // Lượt xem tăng dần theo thời gian + dao động, cuối tuần cao hơn
      const trend = 0.4 + ((DAYS - d) / DAYS) * 0.9;
      const weekday = new Date(dayStart + 7 * 3600000).getUTCDay();
      const weekend = weekday === 0 || weekday === 6 ? 1.35 : 1;
      const n = Math.max(0, Math.round(rand(4, 40) * popularity * trend * weekend));
      for (let i = 0; i < n; i += 1) {
        const createdAt = eventTime(dayStart);
        if (createdAt.getTime() > now) continue;
        // Phân bố thời gian xem: phần lớn lướt qua sớm, một phần xem hết/lặp lại
        const r = Math.random();
        let ratio;
        if (r < 0.25) ratio = rand(0.02, 0.15);
        else if (r < 1 - hook * 0.55) ratio = rand(0.15, 0.9);
        else ratio = rand(0.9, 1.6); // xem hết, có khi lặp lại
        const watchTimeMs = Math.round(durMs * ratio);
        const viewer = Math.random() < 0.7 ? pick(users)._id : null;
        if (viewer && String(viewer) === String(v.userId)) continue;
        // ~6% lượt xem dẫn tới chia sẻ, ~12% ghé trang cá nhân
        if (Math.random() < 0.06) shares.push({ videoId: v._id, creatorId: v.userId, userId: viewer, method: Math.random() < 0.6 ? 'copy_link' : 'native', createdAt });
        if (Math.random() < 0.12) profileViews.push({ profileUserId: v.userId, viewerId: viewer, createdAt });
        views.push({
          videoId: v._id,
          creatorId: v.userId,
          viewerId: viewer,
          watchTimeMs,
          videoDurationMs: Math.round(durMs),
          watchedRatio: Math.min(1, ratio),
          completed: ratio >= 0.9,
          source: weighted(SOURCES),
          createdAt,
        });
      }
    }
  }

  // Follow/unfollow: mỗi creator nhận vài follow mỗi ngày, thỉnh thoảng bị unfollow
  const creators = [...new Set(videos.map((v) => String(v.userId)))];
  const follows = [];
  for (const c of creators) {
    for (let d = DAYS - 1; d >= 0; d -= 1) {
      const dayStart = todayVN - d * DAY;
      const gained = Math.round(rand(0, 6) * (0.5 + (DAYS - d) / DAYS));
      const lost = Math.random() < 0.35 ? Math.round(rand(0, 2)) : 0;
      for (let i = 0; i < gained + lost; i += 1) {
        const createdAt = eventTime(dayStart);
        if (createdAt.getTime() > now) continue;
        follows.push({
          followerId: pick(users)._id,
          followingId: new mongoose.Types.ObjectId(c),
          action: i < gained ? 'follow' : 'unfollow',
          createdAt,
        });
      }
    }
  }

  // insertMany với timestamps: giữ createdAt đã đặt
  for (let i = 0; i < views.length; i += 5000) {
    await ViewEvent.insertMany(views.slice(i, i + 5000), { ordered: false, timestamps: false });
  }
  if (follows.length) await FollowEvent.insertMany(follows, { ordered: false, timestamps: false });
  if (shares.length) await ShareEvent.insertMany(shares, { ordered: false, timestamps: false });
  for (let i = 0; i < profileViews.length; i += 5000) {
    await ProfileViewEvent.insertMany(profileViews.slice(i, i + 5000), { ordered: false, timestamps: false });
  }

  console.log(`Đã sinh ${views.length} ViewEvent, ${follows.length} FollowEvent, ${shares.length} ShareEvent, ${profileViews.length} ProfileViewEvent cho ${videos.length} video trong ${DAYS} ngày.`);
  console.log('Số liệu trên trang phân tích được cache 2–5 phút; đợi một chút hoặc khởi động lại Redis để thấy ngay.');
  await mongoose.disconnect();
  process.exit(0);
})().catch((err) => {
  console.error('seedAnalytics failed:', err);
  process.exit(1);
});
