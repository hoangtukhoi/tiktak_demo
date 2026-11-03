const request = require('supertest');
const app = require('../../src/app');
const Follow = require('../../src/models/Follow');
const redis = require('../helpers/fakeRedis');
const { useTestDb } = require('./helpers/db');
const { createUser, createVideo } = require('./helpers/factory');

useTestDb();

const forYou = (query = {}, auth = {}) => request(app).get('/api/feed/for-you').query(query).set(auth);
const HOUR = 3600000;

describe('GET /api/feed/for-you', () => {
  test('chỉ có video công khai, sẵn sàng, chưa bị gắn cờ/gỡ', async () => {
    const { user } = await createUser();
    await createVideo(user, { title: 'ok' });
    await createVideo(user, { title: 'chờ duyệt', moderationStatus: 'pending' });
    await createVideo(user, { title: 'riêng tư', isPrivate: true });
    await createVideo(user, { title: 'xử lý', status: 'processing' });
    await createVideo(user, { title: 'xoá', status: 'deleted' });
    await createVideo(user, { title: 'cờ', moderationStatus: 'flagged' });
    await createVideo(user, { title: 'gỡ', moderationStatus: 'removed' });
    const titles = (await forYou()).body.data.map((v) => v.title).sort();
    expect(titles).toEqual(['chờ duyệt', 'ok']);
  });

  test('DB trống → mảng rỗng, nextCursor null', async () => {
    const res = await forYou();
    expect(res.body.data).toEqual([]);
    expect(res.body.pagination.nextCursor).toBeNull();
  });

  test.each([
    [undefined, 20],
    ['1', 1],
    ['50', 50],
    ['51', 50],
    ['0', 20],
    ['-5', 1],
    ['abc', 20],
  ])('limit=%p → %i video', async (limit, expected) => {
    const { user } = await createUser();
    await Promise.all(Array.from({ length: 55 }, () => createVideo(user)));
    const res = await forYou(limit === undefined ? {} : { limit });
    expect(res.body.data).toHaveLength(expected);
  });

  test('lướt hết các trang → đủ video, không trùng lặp', async () => {
    const { user } = await createUser();
    await Promise.all(Array.from({ length: 23 }, (_, i) => createVideo(user, { likeCount: i % 4 })));
    const seen = [];
    let cursor;
    for (let guard = 0; guard < 10; guard += 1) {
      // eslint-disable-next-line no-await-in-loop
      const res = await forYou({ limit: 10, ...(cursor && { cursor }) });
      seen.push(...res.body.data.map((v) => v._id));
      cursor = res.body.pagination.nextCursor;
      if (!cursor) break;
    }
    expect(seen).toHaveLength(23);
    expect(new Set(seen).size).toBe(23);
  });

  test('đúng 20 video với limit 20 → không có trang sau', async () => {
    const { user } = await createUser();
    await Promise.all(Array.from({ length: 20 }, () => createVideo(user)));
    expect((await forYou({ limit: 20 })).body.pagination.nextCursor).toBeNull();
  });

  test('video mới nhiều tương tác xếp trên; video cũ 1 tuần bị giảm điểm theo thời gian', async () => {
    const { user } = await createUser();
    await createVideo(user, { title: 'cũ', likeCount: 50, createdAt: new Date(Date.now() - 7 * 24 * HOUR) });
    await createVideo(user, { title: 'mới', likeCount: 10 });
    expect((await forYou()).body.data[0].title).toBe('mới');
  });

  test('người đang theo dõi được ưu tiên (×2) khi điểm ngang nhau', async () => {
    const viewer = await createUser();
    const a = await createUser();
    const b = await createUser();
    await createVideo(a.user, { title: 'A', likeCount: 5 });
    await createVideo(b.user, { title: 'B', likeCount: 5 });
    await Follow.create({ followerId: viewer.user._id, followingId: b.user._id });
    expect((await forYou({}, viewer.auth)).body.data[0].title).toBe('B');
  });

  test('kết quả được cache: video mới đăng chưa xuất hiện ngay ở trang đã cache', async () => {
    const { user } = await createUser();
    await createVideo(user, { title: 'v1' });
    await forYou();
    await createVideo(user, { title: 'v2' });
    expect((await forYou()).body.data).toHaveLength(1);
    await redis.flushall(); // hết hạn cache
    expect((await forYou()).body.data).toHaveLength(2);
  });

  test('cache tách riêng khách và từng người dùng', async () => {
    const viewer = await createUser();
    const { user } = await createUser();
    await createVideo(user);
    await forYou();
    await forYou({}, viewer.auth);
    const keys = [...redis.store.keys()].filter((k) => k.startsWith('feed:foryou:'));
    expect(keys).toHaveLength(2);
  });
});

describe('GET /api/feed/following', () => {
  test('chưa đăng nhập → 401', async () => {
    expect((await request(app).get('/api/feed/following')).status).toBe(401);
  });

  test('chỉ video công khai của người đang theo dõi', async () => {
    const viewer = await createUser();
    const followed = await createUser();
    const stranger = await createUser();
    await createVideo(followed.user, { title: 'theo dõi' });
    await createVideo(followed.user, { title: 'riêng tư', isPrivate: true });
    await createVideo(stranger.user, { title: 'lạ' });
    await Follow.create({ followerId: viewer.user._id, followingId: followed.user._id });
    const res = await request(app).get('/api/feed/following').set(viewer.auth);
    expect(res.body.data.map((v) => v.title)).toEqual(['theo dõi']);
  });

  test('chưa theo dõi ai → mảng rỗng', async () => {
    const viewer = await createUser();
    expect((await request(app).get('/api/feed/following').set(viewer.auth)).body.data).toEqual([]);
  });
});
