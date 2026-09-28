/**
 * env.js — Kiểm tra và export tất cả biến môi trường
 * App sẽ crash ngay khi khởi động nếu thiếu biến bắt buộc (fail-fast)
 */

const REQUIRED_VARS = [
  'MONGODB_URI',
  'REDIS_URL',
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
  'S3_ENDPOINT',
  'S3_ACCESS_KEY',
  'S3_SECRET_KEY',
  'FRONTEND_URL',
];

function validateEnv() {
  const missing = REQUIRED_VARS.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    console.error('\n❌ [ENV] Thiếu các biến môi trường bắt buộc:');
    missing.forEach((key) => console.error(`   - ${key}`));
    console.error('\n💡 Hướng dẫn: copy file .env.example → .env rồi điền đầy đủ giá trị\n');
    process.exit(1);
  }
}

validateEnv();

module.exports = {
  // Server
  PORT:     process.env.PORT     || '5000',
  NODE_ENV: process.env.NODE_ENV || 'development',

  // MongoDB
  MONGODB_URI: process.env.MONGODB_URI,

  // Redis
  REDIS_URL: process.env.REDIS_URL,

  // JWT
  JWT_SECRET:              process.env.JWT_SECRET,
  JWT_EXPIRES_IN:          process.env.JWT_EXPIRES_IN          || '15m',
  JWT_REFRESH_SECRET:      process.env.JWT_REFRESH_SECRET,
  JWT_REFRESH_EXPIRES_IN:  process.env.JWT_REFRESH_EXPIRES_IN  || '7d',

  // Google OAuth (optional)
  GOOGLE_CLIENT_ID:      process.env.GOOGLE_CLIENT_ID      || '',
  GOOGLE_CLIENT_SECRET:  process.env.GOOGLE_CLIENT_SECRET  || '',
  GOOGLE_CALLBACK_URL:   process.env.GOOGLE_CALLBACK_URL   || 'http://localhost:5000/api/auth/google/callback',

  // MinIO / S3
  S3_ENDPOINT:           process.env.S3_ENDPOINT,
  S3_REGION:             process.env.S3_REGION             || 'us-east-1',
  S3_ACCESS_KEY:         process.env.S3_ACCESS_KEY,
  S3_SECRET_KEY:         process.env.S3_SECRET_KEY,
  S3_BUCKET_VIDEOS:      process.env.S3_BUCKET_VIDEOS      || 'tiktak-videos',
  S3_BUCKET_THUMBNAILS:  process.env.S3_BUCKET_THUMBNAILS  || 'tiktak-thumbnails',
  S3_BUCKET_AUDIO:       process.env.S3_BUCKET_AUDIO       || 'tiktak-audio',

  // CORS
  FRONTEND_URL: process.env.FRONTEND_URL,

  // Internal / AI service
  INTERNAL_KEY:    process.env.INTERNAL_KEY    || 'internal_secret_key',
  AI_SERVICE_URL:  process.env.AI_SERVICE_URL  || 'http://localhost:8002',

  // Admin seed (optional)
  ADMIN_EMAIL:     process.env.ADMIN_EMAIL     || 'admin@tiktak.com',
  ADMIN_PASSWORD:  process.env.ADMIN_PASSWORD  || 'Admin@123456',
  ADMIN_USERNAME:  process.env.ADMIN_USERNAME  || 'admin',
};
