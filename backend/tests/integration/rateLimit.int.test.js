// File riêng: bộ đếm giới hạn tần suất lưu trong bộ nhớ của app,
// tách ra để các test khác không làm "hết lượt" trước.
const request = require('supertest');
const app = require('../../src/app');
const { useTestDb } = require('./helpers/db');
const { createUser, createVideo } = require('./helpers/factory');

useTestDb();

test('đếm lượt xem: tối đa 120 lượt/phút/IP — lượt 120 vẫn 200, lượt 121 → 429', async () => {
  const owner = await createUser();
  const v = await createVideo(owner.user);
  const results = [];
  for (let i = 0; i < 121; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    results.push((await request(app).post(`/api/videos/${v._id}/view`).send({})).status);
  }
  expect(results.slice(0, 120).every((s) => s === 200)).toBe(true);
  expect(results[120]).toBe(429);
  expect((await request(app).post(`/api/videos/${v._id}/view`).send({})).body.message).toBe('Too many requests');
});
