/**
 * MongoDB thật chạy trong bộ nhớ cho integration test.
 * Lần chạy đầu, mongodb-memory-server tự tải file MongoDB (~70 MB) về máy rồi lưu cache.
 */
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const redis = require('../../helpers/fakeRedis');

let mongod;

async function connect() {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri(), { dbName: 'tiktak_test' });
  // Đảm bảo unique index đã tạo xong trước khi test (VD: chống like/follow trùng)
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
}

async function clear() {
  const collections = await mongoose.connection.db.collections();
  await Promise.all(collections.map((c) => c.deleteMany({})));
  await redis.flushall();
}

async function close() {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
}

/** Dùng trong mỗi file test: kết nối 1 lần, dọn dữ liệu trước mỗi test */
function useTestDb() {
  beforeAll(connect);
  beforeEach(clear);
  afterAll(close);
}

module.exports = { connect, clear, close, useTestDb };
