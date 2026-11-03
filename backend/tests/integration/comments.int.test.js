const request = require('supertest');
const app = require('../../src/app');
const Video = require('../../src/models/Video');
const Comment = require('../../src/models/Comment');
const Notification = require('../../src/models/Notification');
const { useTestDb } = require('./helpers/db');
const { createUser, createVideo } = require('./helpers/factory');

useTestDb();

const post = (auth, body) => request(app).post('/api/comments').set(auth).send(body);

describe('POST /api/comments — tạo bình luận', () => {
  let owner;
  let fan;
  let video;
  beforeEach(async () => {
    owner = await createUser();
    fan = await createUser();
    video = await createVideo(owner.user);
  });

  test('tạo thành công → 201, commentCount +1, chủ video nhận thông báo', async () => {
    const res = await post(fan.auth, { videoId: video._id, content: 'Hay quá' });
    expect(res.status).toBe(201);
    expect((await Video.findById(video._id)).commentCount).toBe(1);
    expect(await Notification.countDocuments({ userId: owner.user._id, type: 'new_comment' })).toBe(1);
  });

  test('chủ video tự bình luận → không tự gửi thông báo cho mình', async () => {
    await post(owner.auth, { videoId: video._id, content: 'Cảm ơn mọi người' });
    expect(await Notification.countDocuments()).toBe(0);
  });

  describe('độ dài nội dung: 1–500 ký tự (sau khi bỏ khoảng trắng)', () => {
    test.each([
      ['1 ký tự → 201', 'a', 201],
      ['500 ký tự → 201', 'a'.repeat(500), 201],
      ['501 ký tự → 400', 'a'.repeat(501), 400],
      ['rỗng → 400', '', 400],
      ['chỉ có khoảng trắng → 400', '    ', 400],
      ['xuống dòng + tab → 400', '\n\t', 400],
      ['không phải chuỗi → 400', 12345, 400],
      ['500 ký tự + khoảng trắng hai đầu → 201', `  ${'a'.repeat(500)}  `, 201],
    ])('%s', async (_, content, status) => {
      expect((await post(fan.auth, { videoId: video._id, content })).status).toBe(status);
    });

    test('nội dung được trim hai đầu', async () => {
      const res = await post(fan.auth, { videoId: video._id, content: '  hay  ' });
      expect(res.body.data.content).toBe('hay');
    });
  });

  test.each([
    ['thiếu videoId', () => ({ content: 'x' }), 400],
    ['videoId sai định dạng', () => ({ videoId: 'abc', content: 'x' }), 400],
    ['video không tồn tại', () => ({ videoId: '0123456789abcdef01234567', content: 'x' }), 404],
  ])('%s → %i', async (_, body, status) => {
    expect((await post(fan.auth, body())).status).toBe(status);
  });

  test('video tắt bình luận → 403', async () => {
    const v = await createVideo(owner.user, { allowComment: false });
    expect((await post(fan.auth, { videoId: v._id, content: 'x' })).status).toBe(403);
  });

  test.each([
    ['riêng tư', { isPrivate: true }],
    ['đã xoá', { status: 'deleted' }],
    ['đang xử lý', { status: 'processing' }],
    ['bị gỡ', { moderationStatus: 'removed' }],
  ])('video %s của người khác → 404, không tạo bình luận', async (_, over) => {
    const v = await createVideo(owner.user, over);
    expect((await post(fan.auth, { videoId: v._id, content: 'x' })).status).toBe(404);
    expect(await Comment.countDocuments({ videoId: v._id })).toBe(0);
  });

  test('chủ video bình luận video riêng tư của mình → được', async () => {
    const v = await createVideo(owner.user, { isPrivate: true });
    expect((await post(owner.auth, { videoId: v._id, content: 'note' })).status).toBe(201);
  });

  describe('trả lời bình luận', () => {
    test('trả lời → replyCount của bình luận gốc +1, người viết gốc nhận thông báo', async () => {
      const parent = (await post(owner.auth, { videoId: video._id, content: 'gốc' })).body.data;
      await post(fan.auth, { videoId: video._id, content: 'trả lời', parentId: parent._id });
      expect((await Comment.findById(parent._id)).replyCount).toBe(1);
      expect(await Notification.countDocuments({ userId: owner.user._id, type: 'mention' })).toBe(1);
    });

    test('parentId thuộc video KHÁC → 400', async () => {
      const other = await createVideo(owner.user);
      const parent = (await post(fan.auth, { videoId: other._id, content: 'ở video khác' })).body.data;
      const res = await post(fan.auth, { videoId: video._id, content: 'trả lời', parentId: parent._id });
      expect(res.status).toBe(400);
    });

    test('trả lời bình luận đã xoá → 404', async () => {
      const parent = (await post(fan.auth, { videoId: video._id, content: 'gốc' })).body.data;
      await request(app).delete(`/api/comments/${parent._id}`).set(fan.auth);
      expect((await post(fan.auth, { videoId: video._id, content: 'x', parentId: parent._id })).status).toBe(404);
    });
  });
});

describe('DELETE /api/comments/:id', () => {
  test('tác giả xoá → commentCount giảm, xoá lần 2 → 404, không bị trừ 2 lần', async () => {
    const owner = await createUser();
    const v = await createVideo(owner.user);
    const c = (await post(owner.auth, { videoId: v._id, content: 'x' })).body.data;
    expect((await request(app).delete(`/api/comments/${c._id}`).set(owner.auth)).status).toBe(200);
    expect((await request(app).delete(`/api/comments/${c._id}`).set(owner.auth)).status).toBe(404);
    expect((await Video.findById(v._id)).commentCount).toBe(0);
  });

  test('người khác xoá → 403', async () => {
    const owner = await createUser();
    const other = await createUser();
    const v = await createVideo(owner.user);
    const c = (await post(owner.auth, { videoId: v._id, content: 'x' })).body.data;
    expect((await request(app).delete(`/api/comments/${c._id}`).set(other.auth)).status).toBe(403);
  });

  test('xoá cùng lúc 2 lần → commentCount chỉ giảm 1', async () => {
    const owner = await createUser();
    const v = await createVideo(owner.user);
    await post(owner.auth, { videoId: v._id, content: 'giữ lại' });
    const c = (await post(owner.auth, { videoId: v._id, content: 'xoá' })).body.data;
    await Promise.all([1, 2].map(() => request(app).delete(`/api/comments/${c._id}`).set(owner.auth)));
    expect((await Video.findById(v._id)).commentCount).toBe(1);
  });
});

describe('GET /api/comments/video/:videoId — phân trang', () => {
  test.each([
    [undefined, 20],
    ['1', 1],
    ['100', 100],
    ['101', 100],
    ['0', 20],
    ['-1', 1],
  ])('limit=%p → %i bình luận', async (limit, expected) => {
    const owner = await createUser();
    const v = await createVideo(owner.user);
    await Comment.insertMany(Array.from({ length: 105 }, (_, i) => ({ videoId: v._id, userId: owner.user._id, content: `c${i}` })));
    const res = await request(app).get(`/api/comments/video/${v._id}`).query(limit === undefined ? {} : { limit });
    expect(res.body.data).toHaveLength(expected);
  });

  test('không trả bình luận đã xoá và các câu trả lời (chỉ bình luận gốc)', async () => {
    const owner = await createUser();
    const v = await createVideo(owner.user);
    const root = await Comment.create({ videoId: v._id, userId: owner.user._id, content: 'gốc' });
    await Comment.create({ videoId: v._id, userId: owner.user._id, content: 'đã xoá', isDeleted: true });
    await Comment.create({ videoId: v._id, userId: owner.user._id, content: 'reply', parentId: root._id });
    const res = await request(app).get(`/api/comments/video/${v._id}`);
    expect(res.body.data.map((c) => c.content)).toEqual(['gốc']);
  });
});
