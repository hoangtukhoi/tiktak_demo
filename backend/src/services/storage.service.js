const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { Readable } = require('stream');
const {
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
  PutBucketPolicyCommand,
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const { s3, BUCKETS, publicUrl } = require('../config/cloudStorage');

const mime = {
  '.mp4': 'video/mp4',
  '.mkv': 'video/x-matroska',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.m3u8': 'application/vnd.apple.mpegurl',
  '.ts': 'video/mp2t',
  '.vtt': 'text/vtt',
  '.srt': 'application/x-subrip',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
};

const contentTypeOf = (key) => mime[path.extname(key).toLowerCase()] || 'application/octet-stream';

// Mặc định cho trình duyệt cache 1 ngày. File có tên duy nhất (uuid/timestamp)
// thì truyền IMMUTABLE_CACHE để cache 1 năm.
const DEFAULT_CACHE = 'public, max-age=86400';
const IMMUTABLE_CACHE = 'public, max-age=31536000, immutable';

/**
 * Đảm bảo các bucket tồn tại trên MinIO/S3
 */
/**
 * Cho phép đọc công khai (GET object) — trình duyệt phát video/ảnh trực tiếp
 * từ URL MinIO nên bucket phải public-read, nếu không sẽ bị 403 AccessDenied.
 * Chỉ mở quyền ĐỌC object; ghi/xoá/liệt kê vẫn cần access key.
 */
async function makePublicRead(bucket) {
  const policy = {
    Version: '2012-10-17',
    Statement: [
      {
        Effect: 'Allow',
        Principal: { AWS: ['*'] },
        Action: ['s3:GetObject'],
        Resource: [`arn:aws:s3:::${bucket}/*`],
      },
    ],
  };
  try {
    await s3.send(new PutBucketPolicyCommand({ Bucket: bucket, Policy: JSON.stringify(policy) }));
  } catch (err) {
    console.warn(`[storage] Could not set public-read policy for ${bucket}:`, err.message);
  }
}

async function ensureBucket(bucket) {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucket }));
  } catch {
    try {
      await s3.send(new CreateBucketCommand({ Bucket: bucket }));
      console.log(`[storage] Created bucket: ${bucket}`);
    } catch (err) {
      console.warn(`[storage] Could not create bucket ${bucket}:`, err.message);
      return;
    }
  }
  await makePublicRead(bucket);
}

async function ensureBuckets() {
  for (const bucket of Object.values(BUCKETS)) {
    await ensureBucket(bucket);
  }
}

/**
 * Upload buffer trực tiếp lên S3
 */
async function uploadBuffer(key, buffer, contentType, bucket = BUCKETS.VIDEOS, cacheControl = DEFAULT_CACHE) {
  try {
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType || contentTypeOf(key),
        CacheControl: cacheControl,
      })
    );
  } catch (err) {
    if (err.name === 'NoSuchBucket' || err.message?.includes('bucket does not exist')) {
      await ensureBucket(bucket);
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: buffer,
          ContentType: contentType || contentTypeOf(key),
          CacheControl: cacheControl,
        })
      );
    } else {
      throw err;
    }
  }
  return publicUrl(bucket, key);
}

/**
 * Upload file từ ổ đĩa
 */
async function uploadFile(key, filePath, bucket = BUCKETS.VIDEOS, cacheControl = DEFAULT_CACHE) {
  const buffer = await fsp.readFile(filePath);
  return uploadBuffer(key, buffer, contentTypeOf(filePath), bucket, cacheControl);
}

/**
 * Tải file từ S3 về ổ đĩa
 */
async function downloadToFile(bucket, key, destPath) {
  const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  await fsp.mkdir(path.dirname(destPath), { recursive: true });
  await new Promise((resolve, reject) => {
    const out = fs.createWriteStream(destPath);
    res.Body.pipe(out);
    res.Body.on('error', reject);
    out.on('finish', resolve);
    out.on('error', reject);
  });
  return destPath;
}

/**
 * Xoá một object khỏi S3
 */
async function deleteFile(key, bucket = BUCKETS.VIDEOS) {
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch (err) {
    console.error(`[storage] Failed to delete file ${key}:`, err.message);
    return false;
  }
}

/**
 * Suy ra object key từ public URL (dùng cho script transcode lại video cũ)
 */
function keyFromUrl(url, bucket) {
  if (!url) return null;
  const marker = `/${bucket}/`;
  const i = url.indexOf(marker);
  if (i === -1) return null;
  return url.slice(i + marker.length).split('/').map(decodeURIComponent).join('/');
}

/**
 * Lấy presigned upload url
 */
async function getPresignedUploadUrl(key, expiresIn = 900, bucket = BUCKETS.VIDEOS) {
  return getSignedUrl(
    s3,
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentTypeOf(key),
    }),
    { expiresIn }
  );
}

module.exports = {
  BUCKETS,
  ensureBuckets,
  uploadBuffer,
  uploadFile,
  downloadToFile,
  deleteFile,
  getPresignedUploadUrl,
  publicUrl,
  contentTypeOf,
  keyFromUrl,
  DEFAULT_CACHE,
  IMMUTABLE_CACHE,
};