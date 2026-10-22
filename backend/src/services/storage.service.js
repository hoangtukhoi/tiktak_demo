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

/**
 * Đảm bảo các bucket tồn tại trên MinIO/S3
 */
async function ensureBucket(bucket) {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucket }));
  } catch {
    try {
      await s3.send(new CreateBucketCommand({ Bucket: bucket }));
      console.log(`[storage] Created bucket: ${bucket}`);
    } catch (err) {
      console.warn(`[storage] Could not create bucket ${bucket}:`, err.message);
    }
  }
}

async function ensureBuckets() {
  for (const bucket of Object.values(BUCKETS)) {
    await ensureBucket(bucket);
  }
}

/**
 * Upload buffer trực tiếp lên S3
 */
async function uploadBuffer(key, buffer, contentType, bucket = BUCKETS.VIDEOS) {
  try {
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType || contentTypeOf(key),
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
async function uploadFile(key, filePath, bucket = BUCKETS.VIDEOS) {
  const buffer = await fsp.readFile(filePath);
  return uploadBuffer(key, buffer, contentTypeOf(filePath), bucket);
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
};