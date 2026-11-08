const request = require('supertest');
process.env.FRONTEND_URL = 'http://localhost:3000';
const app = require('../../src/app');
const ShareEvent = require('../../src/models/ShareEvent');
const { useTestDb } = require('./helpers/db');
const { createUser, createVideo } = require('./helpers/factory');

useTestDb();

describe('GET /s/:id — link chia sẻ có khung xem trước', () => {
  test('video công khai → có og:title, og:image, chuyển sang /watch/:id', async () => {
    const { user } = await createUser({ username: 'hoang' });
    const v = await createVideo(user, { title: 'Bún bò Huế', thumbnailUrl: 'https://cdn.test/t.jpg' });
    const res = await request(app).get(`/s/${v._id}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/html/);
    expect(res.text).toContain('<meta property="og:title" content="Bún bò Huế — @hoang">');
    expect(res.text).toContain('<meta property="og:image" content="https://cdn.test/t.jpg">');
    expect(res.text).toContain(`http://localhost:3000/watch/${v._id}`);
  });

  test('tiêu đề chứa HTML/JS → được escape, không chèn được mã', async () => {
    const { user } = await createUser();
    const v = await createVideo(user, { title: '"><script>alert(1)</script>' });
    const res = await request(app).get(`/s/${v._id}`);
    expect(res.text).not.toContain('<script>alert(1)</script>');
    expect(res.text).toContain('&quot;&gt;&lt;script&gt;');
  });

  test.each([
    ['riêng tư', { isPrivate: true }],
    ['đã xoá', { status: 'deleted' }],
    ['bị gỡ', { moderationStatus: 'removed' }],
  ])('video %s → trang chung chung, không lộ tiêu đề', async (_, over) => {
    const { user } = await createUser();
    const v = await createVideo(user, { title: 'Bí mật', ...over });
    const res = await request(app).get(`/s/${v._id}`);
    expect(res.text).not.toContain('Bí mật');
    expect(res.text).toContain('Video trên TikTak');
  });

  test('id sai định dạng → vẫn 200 trang chung, không lỗi 500', async () => {
    const res = await request(app).get('/s/abc');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Video trên TikTak');
  });
});

describe('POST /api/videos/:id/share — ghi nhận từng mạng xã hội', () => {
  test.each(['facebook', 'messenger', 'zalo', 'x', 'telegram', 'whatsapp', 'email', 'copy_link', 'native'])('method=%s được lưu đúng', async (method) => {
    const { user } = await createUser();
    const v = await createVideo(user);
    await request(app).post(`/api/videos/${v._id}/share`).send({ method });
    expect((await ShareEvent.findOne()).method).toBe(method);
  });

  test('method lạ → "other"', async () => {
    const { user } = await createUser();
    const v = await createVideo(user);
    await request(app).post(`/api/videos/${v._id}/share`).send({ method: 'tiktok' });
    expect((await ShareEvent.findOne()).method).toBe('other');
  });
});
