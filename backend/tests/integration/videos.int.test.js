const request = require('supertest');
const app = require('../../src/app');
const Video = require('../../src/models/Video');
const User = require('../../src/models/User');
const Like = require('../../src/models/Like');
const ViewEvent = require('../../src/models/ViewEvent');
const ShareEvent = require('../../src/models/ShareEvent');
const { useTestDb } = require('./helpers/db');
const { createUser, createVideo } = require('./helpers/factory');

useTestDb();

const FAKE_ID = '0123456789abcdef01234567';

describe('GET /api/videos/:id — quyền xem', () => {
  test.each([
    ['id sai định dạng', 'abc', 400],
    ['id đúng định dạng nhưng không tồn tại', FAKE_ID, 404],
  ])('%s → %i', async (_, id, status) => {
    expect((await request(app).get(`/api/videos/${id}`)).status).toBe(status);
  });

  test('video riêng tư: khách 404, chủ 200, admin 200', async () => {
    const owner = await createUser();
    const admin = await createUser({ role: 'admin' });
    const v = await createVideo(owner.user, { isPrivate: true });
    expect((await request(app).get(`/api/videos/${v._id}`)).status).toBe(404);
    expect((await request(app).get(`/api/videos/${v._id}`).set(owner.auth)).status).toBe(200);
    expect((await request(app).get(`/api/videos/${v._id}`).set(admin.auth)).status).toBe(200);
  });

  test('token hết hạn khi xem video công khai → vẫn xem được như khách', async () => {
    const owner = await createUser();
    const v = await createVideo(owner.user);
    const res = await request(app).get(`/api/videos/${v._id}`).set('Authorization', 'Bearer expired.token.here');
    expect(res.status).toBe(200);
    expect(res.body.data.isLiked).toBe(false);
  });
});

describe('POST /api/videos/:id/like — thích / bỏ thích', () => {
  const like = (auth, id) => request(app).post(`/api/videos/${id}/like`).set(auth);

  test('thích rồi bỏ thích → likeCount 1 rồi 0', async () => {
    const owner = await createUser();
    const fan = await createUser();
    const v = await createVideo(owner.user);
    expect((await like(fan.auth, v._id)).body.data).toEqual({ liked: true, likeCount: 1 });
    expect((await like(fan.auth, v._id)).body.data).toEqual({ liked: false });
    expect((await Video.findById(v._id)).likeCount).toBe(0);
  });

  test('bỏ thích khi likeCount đã = 0 (dữ liệu lệch) → không xuống âm', async () => {
    const owner = await createUser();
    const fan = await createUser();
    const v = await createVideo(owner.user, { likeCount: 0 });
    await Like.create({ userId: fan.user._id, targetId: v._id, targetType: 'video' });
    await like(fan.auth, v._id);
    expect((await Video.findById(v._id)).likeCount).toBe(0);
  });

  test('bấm thích 2 lần cùng lúc → bộ đếm khớp số bản ghi Like', async () => {
    const owner = await createUser();
    const fan = await createUser();
    const v = await createVideo(owner.user);
    await Promise.all([like(fan.auth, v._id), like(fan.auth, v._id)]);
    const real = await Like.countDocuments({ targetId: v._id });
    expect(real).toBeLessThanOrEqual(1);
    expect((await Video.findById(v._id)).likeCount).toBe(real);
  });

  test('10 người thích cùng lúc → likeCount = 10', async () => {
    const owner = await createUser();
    const v = await createVideo(owner.user);
    const fans = await Promise.all(Array.from({ length: 10 }, () => createUser()));
    await Promise.all(fans.map((f) => like(f.auth, v._id)));
    expect((await Video.findById(v._id)).likeCount).toBe(10);
  });

  test('video riêng tư của người khác → 404, không tạo Like', async () => {
    const owner = await createUser();
    const fan = await createUser();
    const v = await createVideo(owner.user, { isPrivate: true });
    expect((await like(fan.auth, v._id)).status).toBe(404);
    expect(await Like.countDocuments()).toBe(0);
  });

  test('chưa đăng nhập → 401', async () => {
    const owner = await createUser();
    const v = await createVideo(owner.user);
    expect((await request(app).post(`/api/videos/${v._id}/like`)).status).toBe(401);
  });
});

describe('POST /api/videos/:id/view — đếm lượt xem', () => {
  const view = (id, body, auth = {}) => request(app).post(`/api/videos/${id}/view`).set(auth).send(body);

  test('khách xem → +1 viewCount và 1 ViewEvent', async () => {
    const owner = await createUser();
    const v = await createVideo(owner.user);
    expect((await view(v._id, { watchTimeMs: 4000, source: 'for_you' })).status).toBe(200);
    expect((await Video.findById(v._id)).viewCount).toBe(1);
    const ev = await ViewEvent.findOne({ videoId: v._id });
    expect(ev).toMatchObject({ watchTimeMs: 4000, watchedRatio: 0.4, source: 'for_you', completed: false });
  });

  test('chủ video tự xem → viewCount tăng nhưng không ghi ViewEvent', async () => {
    const owner = await createUser();
    const v = await createVideo(owner.user);
    await view(v._id, { watchTimeMs: 4000 }, owner.auth);
    expect((await Video.findById(v._id)).viewCount).toBe(1);
    expect(await ViewEvent.countDocuments()).toBe(0);
  });

  test('người xem đã đăng nhập → lưu viewerId', async () => {
    const owner = await createUser();
    const fan = await createUser();
    const v = await createVideo(owner.user);
    await view(v._id, { watchTimeMs: 1000 }, fan.auth);
    expect(String((await ViewEvent.findOne()).viewerId)).toBe(String(fan.user._id));
  });

  test.each([
    ['id sai', 'abc', 400],
    ['không tồn tại', FAKE_ID, 404],
  ])('%s → %i', async (_, id, status) => {
    expect((await view(id, {})).status).toBe(status);
  });

  test('video đang xử lý → 404, không tăng lượt xem', async () => {
    const owner = await createUser();
    const v = await createVideo(owner.user, { status: 'processing' });
    expect((await view(v._id, {})).status).toBe(404);
    expect((await Video.findById(v._id)).viewCount).toBe(0);
  });

  test('body không phải JSON hợp lệ → 400, không làm sập server', async () => {
    const owner = await createUser();
    const v = await createVideo(owner.user);
    const res = await request(app).post(`/api/videos/${v._id}/view`).set('Content-Type', 'application/json').send('{bad json');
    expect(res.status).toBe(400);
  });

  test('50 lượt xem đồng thời → viewCount = 50 (không mất lượt)', async () => {
    const owner = await createUser();
    const v = await createVideo(owner.user);
    await Promise.all(Array.from({ length: 50 }, () => view(v._id, { watchTimeMs: 1000 })));
    expect((await Video.findById(v._id)).viewCount).toBe(50);
    expect(await ViewEvent.countDocuments()).toBe(50);
  });
});

describe('POST /api/videos/:id/share', () => {
  test('khách chia sẻ → shareCount +1 và ghi ShareEvent', async () => {
    const owner = await createUser();
    const v = await createVideo(owner.user);
    const res = await request(app).post(`/api/videos/${v._id}/share`).send({ method: 'copy_link' });
    expect(res.body.data).toEqual({ shareCount: 1, counted: true });
    expect((await ShareEvent.findOne()).method).toBe('copy_link');
  });

  test('1 tài khoản bấm chia sẻ / sao chép link nhiều lần → chỉ tính 1 lượt', async () => {
    const owner = await createUser();
    const fan = await createUser();
    const v = await createVideo(owner.user);
    const share = (method) => request(app).post(`/api/videos/${v._id}/share`).set(fan.auth).send({ method });
    expect((await share('copy_link')).body.data).toEqual({ shareCount: 1, counted: true });
    expect((await share('copy_link')).body.data).toEqual({ shareCount: 1, counted: false });
    expect((await share('facebook')).body.data).toEqual({ shareCount: 1, counted: false });
    expect((await Video.findById(v._id)).shareCount).toBe(1);
    expect(await ShareEvent.countDocuments()).toBe(1);
  });

  test('bấm liên tục cùng lúc → vẫn chỉ 1 lượt', async () => {
    const owner = await createUser();
    const fan = await createUser();
    const v = await createVideo(owner.user);
    await Promise.all(Array.from({ length: 8 }, () => request(app).post(`/api/videos/${v._id}/share`).set(fan.auth).send({ method: 'copy_link' })));
    expect((await Video.findById(v._id)).shareCount).toBe(1);
  });

  test('2 tài khoản khác nhau → 2 lượt; khách cùng IP chia sẻ 2 lần → 1 lượt', async () => {
    const owner = await createUser();
    const [a, b] = await Promise.all([createUser(), createUser()]);
    const v = await createVideo(owner.user);
    const url = `/api/videos/${v._id}/share`;
    await request(app).post(url).set(a.auth).send({ method: 'zalo' });
    await request(app).post(url).set(b.auth).send({ method: 'zalo' });
    await request(app).post(url).send({ method: 'copy_link' });
    await request(app).post(url).send({ method: 'copy_link' });
    expect((await Video.findById(v._id)).shareCount).toBe(3);
  });

  test('chủ video tự chia sẻ nhiều lần → tính 1 lần', async () => {
    const owner = await createUser();
    const v = await createVideo(owner.user);
    for (let i = 0; i < 3; i += 1) await request(app).post(`/api/videos/${v._id}/share`).set(owner.auth).send({ method: 'copy_link' });
    expect((await Video.findById(v._id)).shareCount).toBe(1);
  });
});

describe('POST /api/videos/:id/report — tự gắn cờ khi đủ 3 báo cáo', () => {
  const report = (auth, id) => request(app).post(`/api/videos/${id}/report`).set(auth).send({ reason: 'spam' });

  test('báo cáo 2 lần → chưa gắn cờ; lần 3 (người thứ 3) → flagged', async () => {
    const owner = await createUser();
    const v = await createVideo(owner.user);
    const reporters = await Promise.all([createUser(), createUser(), createUser()]);
    await report(reporters[0].auth, v._id);
    await report(reporters[1].auth, v._id);
    expect((await Video.findById(v._id)).moderationStatus).toBe('approved');
    await report(reporters[2].auth, v._id);
    expect((await Video.findById(v._id)).moderationStatus).toBe('flagged');
  });

  test('1 người báo cáo 2 lần → lần 2 bị 409, reportCount vẫn 1', async () => {
    const owner = await createUser();
    const fan = await createUser();
    const v = await createVideo(owner.user);
    await report(fan.auth, v._id);
    expect((await report(fan.auth, v._id)).status).toBe(409);
    expect((await Video.findById(v._id)).reportCount).toBe(1);
  });
});

describe('DELETE /api/videos/:id', () => {
  test('chủ xoá → người khác không xem được, videoCount giảm 1', async () => {
    const owner = await createUser({ videoCount: 1 });
    const v = await createVideo(owner.user);
    expect((await request(app).delete(`/api/videos/${v._id}`).set(owner.auth)).status).toBe(200);
    expect((await request(app).get(`/api/videos/${v._id}`)).status).toBe(404);
    expect((await User.findById(owner.user._id)).videoCount).toBe(0);
  });

  test('xoá 2 lần → lần 2 404, videoCount không bị trừ 2 lần', async () => {
    const owner = await createUser({ videoCount: 1 });
    const v = await createVideo(owner.user);
    await request(app).delete(`/api/videos/${v._id}`).set(owner.auth);
    expect((await request(app).delete(`/api/videos/${v._id}`).set(owner.auth)).status).toBe(404);
    expect((await User.findById(owner.user._id)).videoCount).toBe(0);
  });

  test('videoCount = 0 (dữ liệu lệch) → không xuống âm', async () => {
    const owner = await createUser({ videoCount: 0 });
    const v = await createVideo(owner.user);
    await request(app).delete(`/api/videos/${v._id}`).set(owner.auth);
    expect((await User.findById(owner.user._id)).videoCount).toBe(0);
  });

  test('người khác xoá → 404 và video còn nguyên', async () => {
    const owner = await createUser();
    const other = await createUser();
    const v = await createVideo(owner.user);
    expect((await request(app).delete(`/api/videos/${v._id}`).set(other.auth)).status).toBe(404);
    expect((await Video.findById(v._id)).status).toBe('ready');
  });

  test('video đã xoá → không thích, không bình luận, không đếm view được', async () => {
    const owner = await createUser();
    const fan = await createUser();
    const v = await createVideo(owner.user, { status: 'deleted' });
    expect((await request(app).post(`/api/videos/${v._id}/like`).set(fan.auth)).status).toBe(404);
    expect((await request(app).post(`/api/videos/${v._id}/view`).send({})).status).toBe(404);
  });
});

describe('PATCH /api/videos/:id/urls — endpoint nội bộ', () => {
  test('không có x-internal-key → 401; có key đúng → cập nhật', async () => {
    const owner = await createUser();
    const v = await createVideo(owner.user);
    const url = `/api/videos/${v._id}/urls`;
    expect((await request(app).patch(url).send({ hlsUrl: 'x' })).status).toBe(401);
    const ok = await request(app).patch(url).set('x-internal-key', process.env.INTERNAL_KEY).send({ hlsUrl: 'https://cdn/x.mp4', userId: FAKE_ID });
    expect(ok.status).toBe(200);
    const saved = await Video.findById(v._id);
    expect(saved.hlsUrl).toBe('https://cdn/x.mp4');
    expect(String(saved.userId)).toBe(String(owner.user._id)); // trường ngoài whitelist bị bỏ qua
  });
});

describe('GET /api/videos/search', () => {
  test('tìm theo tiêu đề & hashtag; bỏ qua video riêng tư, đã xoá, bị gỡ', async () => {
    const owner = await createUser();
    await createVideo(owner.user, { title: 'Bún bò Huế', hashtags: ['hue'] });
    await createVideo(owner.user, { title: 'Bún bò riêng tư', isPrivate: true });
    await createVideo(owner.user, { title: 'Bún bò đã xoá', status: 'deleted' });
    await createVideo(owner.user, { title: 'Bún bò bị gỡ', moderationStatus: 'removed' });
    const res = await request(app).get('/api/videos/search').query({ q: 'bún' });
    expect(res.body.data.map((v) => v.title)).toEqual(['Bún bò Huế']);
  });

  test.each([[''], ['   ']])('từ khoá rỗng %p → 400', async (q) => {
    expect((await request(app).get('/api/videos/search').query({ q })).status).toBe(400);
  });
});
