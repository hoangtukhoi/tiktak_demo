const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { Readable } = require('stream');
const mime = { '.m3u8': 'application/vnd.apple.mpegurl', '.ts': 'video/mp2t', '.mp4': 'video/mp4', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.vtt': 'text/vtt', '.srt': 'application/x-subrip' };

const {
  PutObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  HeadBucketCommand,
  CreateBucketCommand,
  ListObjectsV2Command,
  GetObjectCommand,
} = require('@aws-sdk/client-s3');
const { Upload } = require('@aws-sdk/lib-storage');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const { s3, BUCKETS, publicUrl } = require('../config/cloudStorage');
const logger = require('../utils/logger');

const contentTypeOf = (key) => mime[path.extname(key).toLowerCase()] || 'application/octet-stream';

/** Tạo bucket nếu chưa tồn tại. Gọi một lần lúc khởi động. */
async function ensureBuckets() {
  for (const bucket of Object.values(BUCKETS)) {
    try {
      await s3.send(new HeadBucketCommand({ Bucket: bucket }));
    } catch (err) {
      try {
        await s3.send(new CreateBucketCommand({ Bucket: bucket }));
        logger.info(`Đã tạo bucket ${bucket}`);
      } catch (createErr) {
        logger.error(`Không tạo được bucket ${bucket}: ${createErr.message}`);
      }
    }
  }
}

/** Upload một Buffer. Trả về URL công khai. */
async function uploadBuffer(key, buffer, contentType, bucket = BUCKETS.VIDEOS) {
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType || contentTypeOf(key),
    })
  );
  return publicUrl(bucket, key);
}

/** Upload theo stream, dùng cho file lớn (multipart tự động). */
async function uploadStream(key, stream, contentType, bucket = BUCKETS.VIDEOS, onProgress) {
  const upload = new Upload({
    client: s3,
    params: {
      Bucket: bucket,
      Key: key,
      Body: stream instanceof Readable ? stream : Readable.from(stream),
      ContentType: contentType || contentTypeOf(key),
    },
    queueSize: 4,
    partSize: 8 * 1024 * 1024,
  });
  if (onProgress) upload.on('httpUploadProgress', (p) => onProgress(p));
  await upload.done();
  return publicUrl(bucket, key);
}

/** Upload một file trên đĩa. */
async function uploadFile(key, filePath, bucket = BUCKETS.VIDEOS) {
  return uploadStream(key, fs.createReadStream(filePath), contentTypeOf(filePath), bucket);
}

/**
 * Upload toàn bộ thư mục (dùng cho output HLS gồm master.m3u8 + các segment .ts).
 * Trả về map { relativePath: url }.
 */
async function uploadDirectory(localDir, keyPrefix, bucket = BUCKETS.VIDEOS) {
  const result = {};
  const walk = async (dir, prefix) => {
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const abs = path.join(dir, entry.name);
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        await walk(abs, rel);
      } else {
        result[rel] = await uploadFile(`${keyPrefix}/${rel}`, abs, bucket);
      }
    }
  };
  await walk(localDir, '');
  return result;
}

/** Tải một object về đĩa, dùng cho worker cần xử lý file gốc bằng ffmpeg. */
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

async function deleteFile(key, bucket = BUCKETS.VIDEOS) {
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  return true;
}

/** Xoá toàn bộ object có chung prefix (dùng khi xoá video). */
async function deletePrefix(keyPrefix, bucket = BUCKETS.VIDEOS) {
  let token;
  let deleted = 0;
  do {
    const list = await s3.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: keyPrefix, ContinuationToken: token })
    );
    const objects = (list.Contents || []).map((o) => ({ Key: o.Key }));
    if (objects.length) {
      await s3.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: objects } }));
      deleted += objects.length;
    }
    token = list.IsTruncated ? list.NextContinuationToken : undefined;
  } while (token);
  return deleted;
}

/** URL upload trực tiếp từ client lên S3 (không đi qua API server). */
async function getPresignedUploadUrl(key, expiresIn = 900, bucket = BUCKETS.VIDEOS) {
  return getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentTypeOf(key) }),
    { expiresIn }
  );
}

/** URL đọc có hạn, dùng khi bucket không mở công khai. */
async function getPresignedDownloadUrl(key, expiresIn = 3600, bucket = BUCKETS.VIDEOS) {
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn });
}

module.exports = {
  ensureBuckets,
  uploadBuffer,
  uploadStream,
  uploadFile,
  uploadDirectory,
  downloadToFile,
  deleteFile,
  deletePrefix,
  getPresignedUploadUrl,
  getPresignedDownloadUrl,
  contentTypeOf,
  publicUrl,
  BUCKETS,
};
