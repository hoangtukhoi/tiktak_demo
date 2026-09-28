/**
 * seed.js — Tạo dữ liệu mẫu cho môi trường dev
 *
 * Chạy: node src/scripts/seed.js
 *
 * Tạo:
 *  - 1 admin account
 *  - 3 user thường
 *  - Mỗi user có 2 video mẫu (status: ready, thumbnailUrl giả)
 *  - Một số follow / like giữa các user
 */

require('dotenv').config();
const mongoose = require('mongoose');

const User       = require('../models/User');
const Video      = require('../models/Video');
const Follow     = require('../models/Follow');
const Like       = require('../models/Like');
const Comment    = require('../models/Comment');

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';

// ─── dữ liệu mẫu ────────────────────────────────────────────
const USERS = [
  {
    username: 'admin',
    email:    'admin@tiktak.com',
    password: 'Admin@123456',
    role:     'admin',
    isVerified: true,
    bio:      'Quản trị viên TikTak',
  },
  {
    username: 'alice_dev',
    email:    'alice@tiktak.com',
    password: 'User@123456',
    role:     'user',
    isVerified: true,
    bio:      'Lập trình viên thích review tech 🎬',
  },
  {
    username: 'bob_music',
    email:    'bob@tiktak.com',
    password: 'User@123456',
    role:     'user',
    isVerified: true,
    bio:      'Music lover 🎵 | Cover songs mỗi ngày',
  },
  {
    username: 'carol_food',
    email:    'carol@tiktak.com',
    password: 'User@123456',
    role:     'user',
    isVerified: true,
    bio:      'Food blogger 🍜 | Review quán ăn Hà Nội',
  },
];

const VIDEO_TEMPLATES = [
  {
    title: 'Review MacBook Pro M4 - Có đáng mua không?',
    description: 'Mình đã dùng MacBook Pro M4 được 2 tuần, đây là đánh giá thật sự nhất.',
    hashtags: ['tech', 'macbook', 'review', 'apple'],
  },
  {
    title: 'Học lập trình trong 100 ngày - Ngày 1',
    description: 'Bắt đầu hành trình học code từ con số 0. Hôm nay học HTML cơ bản.',
    hashtags: ['coding', 'hoccode', 'webdev', 'beginners'],
  },
  {
    title: 'Cover "Người Ơi Người Ở Đừng Về" - Acoustic',
    description: 'Bản cover acoustic nhẹ nhàng bài dân ca Quan họ Bắc Ninh.',
    hashtags: ['music', 'cover', 'acoustic', 'dancat'],
  },
  {
    title: 'Phở Hà Nội - Quán 50 năm tuổi ở phố cổ',
    description: 'Ghé thăm quán phở gia truyền 3 đời tại phố Bát Đàn, Hà Nội.',
    hashtags: ['food', 'pho', 'hanoi', 'streetfood'],
  },
  {
    title: 'Cách setup workspace làm việc tại nhà 2025',
    description: 'Chia sẻ toàn bộ setup WFH của mình: màn hình, bàn phím, tai nghe.',
    hashtags: ['workspace', 'wfh', 'setup', 'productivity'],
  },
  {
    title: 'Bún bò Huế - Nấu đúng vị miền Trung tại nhà',
    description: 'Công thức nấu bún bò Huế chuẩn vị với sả, mắm ruốc và chả cua.',
    hashtags: ['food', 'bunbo', 'cooking', 'hue'],
  },
];

const FAKE_HLS_URL       = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8';
const FAKE_THUMBNAIL_URL = 'https://picsum.photos/seed/{seed}/720/1280';

// ─── helpers ────────────────────────────────────────────────
function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ─── main ────────────────────────────────────────────────────
async function seed() {
  await mongoose.connect(MONGO_URI, { dbName: 'tiktak' });
  console.log('✅ MongoDB connected\n');

  // Xoá dữ liệu cũ
  await Promise.all([
    User.deleteMany({}),
    Video.deleteMany({}),
    Follow.deleteMany({}),
    Like.deleteMany({}),
    Comment.deleteMany({}),
  ]);
  console.log('🗑️  Đã xoá dữ liệu cũ\n');

  // ── Tạo users ──────────────────────────────────────────────
  const createdUsers = [];
  for (const userData of USERS) {
    const user = await User.create(userData);
    createdUsers.push(user);
    console.log(`👤 User: ${user.username} <${user.email}>`);
  }
  console.log('');

  // ── Tạo videos (bỏ admin, chỉ 3 user thường) ─────────────
  const normalUsers = createdUsers.filter((u) => u.role === 'user');
  const allVideos   = [];
  let templateIdx   = 0;

  for (const user of normalUsers) {
    for (let i = 0; i < 2; i++) {
      const tpl   = VIDEO_TEMPLATES[templateIdx % VIDEO_TEMPLATES.length];
      const seed  = `${user.username}-${i}`;
      const video = await Video.create({
        userId:           user._id,
        title:            tpl.title,
        description:      tpl.description,
        hashtags:         tpl.hashtags,
        hlsUrl:           FAKE_HLS_URL,
        thumbnailUrl:     FAKE_THUMBNAIL_URL.replace('{seed}', seed),
        status:           'ready',
        moderationStatus: 'approved',
        durationMs:       randomInt(30000, 180000),
        width:  720,
        height: 1280,
        viewCount:    randomInt(100, 9999),
        likeCount:    randomInt(10,  999),
        commentCount: randomInt(1,   50),
      });
      allVideos.push(video);
      templateIdx++;
      console.log(`🎥 Video: "${video.title.slice(0, 45)}..." (owner: ${user.username})`);
    }

    // Cập nhật videoCount cho user
    await User.updateOne({ _id: user._id }, { $set: { videoCount: 2 } });
  }
  console.log('');

  // ── Tạo follows: mỗi user follow 2 user kia ──────────────
  for (const follower of normalUsers) {
    const targets = normalUsers.filter((u) => !u._id.equals(follower._id));
    for (const target of targets) {
      await Follow.create({ followerId: follower._id, followingId: target._id });
    }
    await User.updateOne({ _id: follower._id }, {
      $set: {
        followingCount: targets.length,
        followerCount:  targets.length,
      },
    });
  }
  console.log(`👥 Follows: mỗi user follow ${normalUsers.length - 1} người còn lại`);

  // ── Tạo likes & comments mẫu ─────────────────────────────
  for (const user of normalUsers) {
    const otherVideos = allVideos.filter((v) => !v.userId.equals(user._id));
    // Like 2 video ngẫu nhiên của người khác
    for (const video of otherVideos.slice(0, 2)) {
      await Like.create({ userId: user._id, targetId: video._id, targetType: 'video' });
    }

    // Comment vào video đầu tiên của người khác
    if (otherVideos[0]) {
      await Comment.create({
        videoId: otherVideos[0]._id,
        userId:  user._id,
        content: `Hay quá ${user.username}! Video rất chất lượng 🔥`,
      });
    }
  }
  console.log(`❤️  Likes & 💬 Comments mẫu đã tạo`);

  // ── Tóm tắt ──────────────────────────────────────────────
  console.log('\n─────────────────────────────────────────');
  console.log('✅ Seed hoàn tất! Thông tin đăng nhập:');
  console.log('─────────────────────────────────────────');
  for (const u of USERS) {
    const roleLabel = u.role === 'admin' ? '🛡️  Admin' : '👤 User ';
    console.log(`${roleLabel}  ${u.email.padEnd(25)} | ${u.password}`);
  }
  console.log('─────────────────────────────────────────\n');

  await mongoose.disconnect();
  process.exit(0);
}

seed().catch((err) => {
  console.error('❌ Seed failed:', err.message);
  process.exit(1);
});
