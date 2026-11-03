/**
 * Mock hạ tầng ngoài cho mọi file integration test:
 * Redis, hàng đợi BullMQ, lưu trữ S3, log ra file, log HTTP.
 * MongoDB thì dùng thật (chạy trong bộ nhớ) — xem db.js.
 */
jest.mock('../../../src/config/redis', () => require('../../helpers/fakeRedis'));
jest.mock('../../../src/jobs/queue', () => ({
  transcodeQueue: { add: jest.fn().mockResolvedValue({ id: 'job1' }), getJobCounts: jest.fn().mockResolvedValue({}) },
  dubbingQueue: { add: jest.fn().mockResolvedValue({ id: 'job2' }), getJobCounts: jest.fn().mockResolvedValue({}) },
  setProgress: jest.fn(),
  getProgress: jest.fn().mockResolvedValue(null),
}));
jest.mock('../../../src/services/storage.service', () => ({
  BUCKETS: { VIDEOS: 'videos', THUMBNAILS: 'thumbnails', AUDIO: 'audio' },
  uploadBuffer: jest.fn(async (key) => `https://cdn.test/${key}`),
  uploadFile: jest.fn(async (key) => `https://cdn.test/${key}`),
  deleteFile: jest.fn().mockResolvedValue(true),
  keyFromUrl: jest.fn(() => null),
  ensureBuckets: jest.fn(),
  publicUrl: (bucket, key) => `https://cdn.test/${bucket}/${key}`,
  DEFAULT_CACHE: '',
  IMMUTABLE_CACHE: '',
}));
jest.mock('../../../src/utils/logger', () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn() }));
jest.mock('morgan', () => () => (req, res, next) => next());

jest.setTimeout(60000);

// Ẩn console.error/warn của controller khi test cố tình gây lỗi
beforeAll(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
});
