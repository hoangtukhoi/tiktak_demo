const { S3Client } = require('@aws-sdk/client-s3');
const { env } = require('./env');

const s3 = new S3Client({
  endpoint: env.S3_ENDPOINT,
  region: env.S3_REGION,
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY,
    secretAccessKey: env.S3_SECRET_KEY,
  },
  forcePathStyle: env.S3_FORCE_PATH_STYLE, // bắt buộc với MinIO
});

const BUCKETS = {
  VIDEOS: env.S3_BUCKET_VIDEOS,
  THUMBNAILS: env.S3_BUCKET_THUMBNAILS,
  AUDIO: env.S3_BUCKET_AUDIO,
};

/** URL công khai của một object, dùng khi bucket đã mở quyền đọc. */
const publicUrl = (bucket, key) =>
  `${env.S3_PUBLIC_URL.replace(/\/$/, '')}/${bucket}/${key.split('/').map(encodeURIComponent).join('/')}`;

module.exports = { s3, BUCKETS, publicUrl };
