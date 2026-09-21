/**
 * Tạo dữ liệu mẫu để chạy thử giao diện khi chưa có video thật.
 * Dùng: npm run seed
 */
const { assertEnv } = require('../config/env');
const connectDB = require('../config/database');
const User = require('../models/User');
const Video = require('../models/Video');
const logger = require('../utils/logger');

const USERS = [
  { username: 'admin', email: 'admin@tiktak.local', password: 'admin123', role: 'admin', isVerified: true },
  { username: 'linh_nguyen', email: 'linh@tiktak.local', password: 'test1234', bio: 'Chia sẻ mẹo học tiếng Anh' },
  { username: 'minh_tran', email: 'minh@tiktak.local', password: 'test1234', bio: 'Ẩm thực đường phố Hà Nội' },
];

const SAMPLE_VIDEOS = [
  { title: 'Ba mẹo phát âm tiếng Anh dễ áp dụng', hashtags: ['hoctienganh', 'tips'], originalLang: 'vi' },
  { title: 'Một ngày ăn hết phố cổ', hashtags: ['amthuc', 'hanoi'], originalLang: 'vi' },
  { title: 'Setup góc học tập dưới hai triệu', hashtags: ['setup', 'sinhvien'], originalLang: 'vi' },
];

async function main() {
  assertEnv();
  await connectDB();

  const users = [];
  for (const data of USERS) {
    const existing = await User.findOne({ email: data.email });
    if (existing) {
      users.push(existing);
      continue;
    }
    users.push(await User.create(data));
  }
  logger.info(`Đã có ${users.length} tài khoản mẫu`);

  let created = 0;
  for (let i = 0; i < SAMPLE_VIDEOS.length; i += 1) {
    const author = users[(i % (users.length - 1)) + 1];
    const exists = await Video.findOne({ title: SAMPLE_VIDEOS[i].title });
    if (exists) continue;
    await Video.create({
      ...SAMPLE_VIDEOS[i],
      userId: author._id,
      status: 'ready',
      moderationStatus: 'approved',
      durationMs: 30000,
      width: 720,
      height: 1280,
      viewCount: Math.floor(Math.random() * 5000),
      likeCount: Math.floor(Math.random() * 500),
    });
    created += 1;
  }

  logger.info(`Đã tạo ${created} video mẫu. Tài khoản admin: admin@tiktak.local / admin123`);
  process.exit(0);
}

main().catch((err) => {
  logger.error(err);
  process.exit(1);
});
