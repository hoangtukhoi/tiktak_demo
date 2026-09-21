require('dotenv').config();

/**
 * Tập trung toàn bộ biến môi trường về một chỗ và kiểm tra ngay khi khởi động.
 * Mọi module khác đọc cấu hình qua file này thay vì process.env rải rác.
 */

const required = ['MONGODB_URI', 'JWT_SECRET', 'JWT_REFRESH_SECRET'];

const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: Number(process.env.PORT || 5000),

  MONGODB_URI: process.env.MONGODB_URI,
  MONGODB_DB_NAME: process.env.MONGODB_DB_NAME || 'tiktak',
  REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',

  JWT_SECRET: process.env.JWT_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '15m',
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET,
  JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN || '7d',

  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || '',
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || '',
  GOOGLE_CALLBACK_URL:
    process.env.GOOGLE_CALLBACK_URL || 'http://localhost:5000/api/auth/google/callback',

  S3_ENDPOINT: process.env.S3_ENDPOINT || 'http://localhost:9000',
  S3_REGION: process.env.S3_REGION || 'us-east-1',
  S3_ACCESS_KEY: process.env.S3_ACCESS_KEY || 'minioadmin',
  S3_SECRET_KEY: process.env.S3_SECRET_KEY || 'minioadmin123',
  S3_PUBLIC_URL: process.env.S3_PUBLIC_URL || process.env.S3_ENDPOINT || 'http://localhost:9000',
  S3_FORCE_PATH_STYLE: process.env.S3_FORCE_PATH_STYLE !== 'false',
  S3_BUCKET_VIDEOS: process.env.S3_BUCKET_VIDEOS || 'tiktak-videos',
  S3_BUCKET_THUMBNAILS: process.env.S3_BUCKET_THUMBNAILS || 'tiktak-thumbnails',
  S3_BUCKET_AUDIO: process.env.S3_BUCKET_AUDIO || 'tiktak-audio',

  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:3000',
  AI_SERVICE_URL: process.env.AI_SERVICE_URL || 'http://localhost:8002',
  AI_SERVICE_TIMEOUT_MS: Number(process.env.AI_SERVICE_TIMEOUT_MS || 600000),
  INTERNAL_KEY: process.env.INTERNAL_KEY || 'internal_secret_key',

  TMP_DIR: process.env.TMP_DIR || require('os').tmpdir(),
  FFMPEG_PATH: process.env.FFMPEG_PATH || '',
  FFPROBE_PATH: process.env.FFPROBE_PATH || '',

  // Bật/tắt worker chạy chung tiến trình với API server.
  RUN_WORKERS_IN_API: process.env.RUN_WORKERS_IN_API !== 'false',
};

function assertEnv() {
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length) {
    throw new Error(
      `Thiếu biến môi trường bắt buộc: ${missing.join(', ')}. Hãy sao chép .env.example thành .env.`
    );
  }
  if (env.NODE_ENV === 'production') {
    const weak = ['your_jwt_secret_change_this_in_production', 'your_refresh_secret_change_this_too'];
    if (weak.includes(env.JWT_SECRET) || weak.includes(env.JWT_REFRESH_SECRET)) {
      throw new Error('JWT secret vẫn là giá trị mẫu, không được dùng ở môi trường production.');
    }
  }
}

module.exports = { env, assertEnv };
