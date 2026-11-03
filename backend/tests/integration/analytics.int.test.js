const request = require('supertest');
const app = require('../../src/app');
const ViewEvent = require('../../src/models/ViewEvent');
const { useTestDb } = require('./helpers/db');
const { createUser, createVideo } = require('./helpers/factory');

useTestDb();

/** Tạo n lượt xem cho video vào thời điểm `at` */
const views = (video, n, { at = new Date(), watchTimeMs = 5000, completed = false, source = 'for_you' } = {}) =>
  ViewEvent.insertMany(
    Array.from({ length: n }, () => ({
      videoId: video._id,
      creatorId: video.userId,
      watchTimeMs,
      videoDurationMs: video.durationMs,
      watchedRatio: Math.min(1, watchTimeMs / video.durationMs),
      completed,
      source,
      createdAt: at,
    }))
  );

describe('GET /api/users/me/analytics — tổng quan kênh', () => {
  afterEach(() => jest.useRealTimers());

  test('đếm lượt xem theo ngày đúng múi giờ Việt Nam (ranh giới 0h)', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'setTimeout', 'setInterval', 'queueMicrotask'] });
    jest.setSystemTime(new Date('2026-11-03T05:00:00Z')); // 12:00 trưa 3/11 giờ VN
    const { user, auth } = await createUser();
    const v = await createVideo(user);
    await views(v, 2, { at: new Date('2026-11-02T16:59:59Z') }); // 23:59:59 ngày 2/11 (VN)
    await views(v, 3, { at: new Date('2026-11-02T17:00:00Z') }); // 00:00:00 ngày 3/11 (VN)
    const res = await request(app).get('/api/users/me/analytics/overview').query({ range: 7 }).set(auth);
    const byDate = Object.fromEntries(res.body.data.series.map((d) => [d.date, d.videoViews]));
    expect(byDate['2026-11-02']).toBe(2);
    expect(byDate['2026-11-03']).toBe(3);
    expect(res.body.data.summary.videoViews.value).toBe(5);
  });

  test('lượt xem ngoài khoảng thời gian không được tính; kỳ trước dùng để so sánh', async () => {
    const { user, auth } = await createUser();
    const v = await createVideo(user);
    const DAY = 86400000;
    await views(v, 4); // hôm nay
    await views(v, 2, { at: new Date(Date.now() - 10 * DAY) }); // kỳ trước (7 ngày trước đó)
    await views(v, 9, { at: new Date(Date.now() - 30 * DAY) }); // ngoài cả 2 kỳ
    const { summary } = (await request(app).get('/api/users/me/analytics/overview').query({ range: 7 }).set(auth)).body.data;
    expect(summary.videoViews).toMatchObject({ value: 4, previous: 2, delta: 2, change: 100 });
  });

  test.each([
    [19, false],
    [20, true],
  ])('nguồn lượt xem: %i lượt → đủ dữ liệu = %p (ngưỡng 20)', async (n, enough) => {
    const { user, auth } = await createUser();
    const v = await createVideo(user);
    await views(v, n);
    const res = await request(app).get('/api/users/me/analytics/overview').set(auth);
    expect(res.body.data.sources.enough).toBe(enough);
  });

  test('chỉ thấy số liệu của chính mình', async () => {
    const me = await createUser();
    const other = await createUser();
    await views(await createVideo(other.user), 10);
    const res = await request(app).get('/api/users/me/analytics/overview').set(me.auth);
    expect(res.body.data.summary.videoViews.value).toBe(0);
  });

  test.each([['admin'], ['xyz']])('tab không hợp lệ "%s" → 404', async (tab) => {
    const { auth } = await createUser();
    expect((await request(app).get(`/api/users/me/analytics/${tab}`).set(auth)).status).toBe(404);
  });

  test('chưa đăng nhập → 401', async () => {
    expect((await request(app).get('/api/users/me/analytics/overview')).status).toBe(401);
  });
});

describe('GET /api/users/me/analytics/videos/:id — từng video', () => {
  test('video của người khác → 404', async () => {
    const me = await createUser();
    const other = await createUser();
    const v = await createVideo(other.user);
    expect((await request(app).get(`/api/users/me/analytics/videos/${v._id}`).set(me.auth)).status).toBe(404);
  });

  test('tỷ lệ xem hết và thời gian xem trung bình tính đúng', async () => {
    const { user, auth } = await createUser();
    const v = await createVideo(user, { durationMs: 10000 });
    await views(v, 3, { watchTimeMs: 10000, completed: true });
    await views(v, 1, { watchTimeMs: 2000 });
    const res = await request(app).get(`/api/users/me/analytics/videos/${v._id}`).set(auth);
    expect(res.status).toBe(200);
    expect(res.body.data.watch).toMatchObject({ views: 4, completionRate: 75, avgWatchSec: 8 });
  });
});

describe('GET /api/users/me/analytics/compare', () => {
  test('so sánh video của mình → mỗi video 1 mục, đúng thứ tự gửi lên', async () => {
    const { user, auth } = await createUser();
    const a = await createVideo(user, { title: 'A' });
    const b = await createVideo(user, { title: 'B' });
    const res = await request(app).get('/api/users/me/analytics/compare').query({ ids: `${b._id},${a._id}` }).set(auth);
    expect(res.status).toBe(200);
    expect(res.body.data.items.map((i) => i.video.title)).toEqual(['B', 'A']);
  });

  test('có 1 video của người khác → 404', async () => {
    const me = await createUser();
    const other = await createUser();
    const a = await createVideo(me.user);
    const b = await createVideo(other.user);
    const res = await request(app).get('/api/users/me/analytics/compare').query({ ids: `${a._id},${b._id}` }).set(me.auth);
    expect(res.status).toBe(404);
  });

  test.each([
    [29, null],
    [30, 10],
  ])('tỷ lệ tương tác: %i lượt xem tổng → %p%% (ngưỡng 30)', async (viewCount, rate) => {
    const { user, auth } = await createUser();
    const a = await createVideo(user, { viewCount, likeCount: 3 });
    const b = await createVideo(user);
    const res = await request(app).get('/api/users/me/analytics/compare').query({ ids: `${a._id},${b._id}` }).set(auth);
    expect(res.body.data.items[0].engagementRate).toBe(rate);
  });
});
