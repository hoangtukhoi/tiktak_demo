const { S3Client } = require('@aws-sdk/client-s3');

const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY,
    secretAccessKey: process.env.S3_SECRET_KEY,
  },
  forcePathStyle: true, // bắt buộc với MinIO
});

const BUCKETS = {
  VIDEOS: process.env.S3_BUCKET_VIDEOS || 'tiktak-videos',
  THUMBNAILS: process.env.S3_BUCKET_THUMBNAILS || 'tiktak-thumbnails',
  AUDIO: process.env.S3_BUCKET_AUDIO || 'tiktak-audio',
};

module.exports = { s3, BUCKETS };
