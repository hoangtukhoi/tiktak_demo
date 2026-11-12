/**
 * Đợt 12/11/2026: vá quyền xem, khoá tài khoản ẩn nội dung, thông báo khi bị xử lý,
 * vai trò kiểm duyệt viên, báo cáo bình luận / tài khoản, kiểm duyệt bình luận 3 mức bằng model.
 */
jest.mock('../../src/services/ai/aiClient', () => ({
  ...jest.requireActual('../../src/services/ai/aiClient'),
  isMock: jest.fn(() => false),
  postQuick: jest.fn(),
  health: jest.fn(),
}));

const request = require('supertest');
const app = require('../../src/app');
const aiClient = require('../../src/services/ai/aiClient');
const User = require('../../src/models/User');
const Video = require('../../src/models/Video');
const Comment = require('../../src/models/Comment');
const Follow = require('../../src/models/Follow');
const AudioTrack = require('../../src/models/AudioTrack');
const AuditLog = require('../../src/models/AuditLog');
const ContentReport = require('../../src/models/ContentReport');
const Notification = require('../../src/models/Notification');
const { useTestDb } = require('./helpers/db');
const { createUser, createVideo } = require('./helpers/factory');

useTestDb();

const modelScore = (score, label = 'toxic') => aiClient.postQuick.mockResolvedValue({ results: [{ score, label }] });
const comment = (auth, videoId, content = 'bình luận') => request(app).post('/api/comments').set(auth).send({ videoId, content });

beforeEach(() => {
  delete process.env.COMMENT_MODERATION_MODE;
  aiClient.isMock.mockReturnValue(false);
  modelScore(0.01, 'clean');
});

// ─── Kiểm duyệt bình luận 3 mức ────────────────────────────────────────────

describe('Kiểm duyệt bình luận bằng model — 3 mức (mặc định)', () => {
  let owner; let writer; let other; let video;
  beforeEach(async () => {
    owner = await createUser();
    writer = await createUser();
    other = await createUser();
    video = await createVideo(owner.user);
  });
  const publicList = async () => (await request(app).get(`/api/comments/video/${video._id}`).set(other.auth)).body.data;

  test('điểm thấp → hiện ngay, tăng số bình luận', async () => {
    modelScore(0.1, 'clean');
    const res = await comment(writer.auth, video._id, 'video hay quá');
    expect(res.body.data.moderationStatus).toBe('approved');
    expect(await publicList()).toHaveLength(1);
    expect((await Video.findById(video._id)).commentCount).toBe(1);
  });

  test('điểm vừa → chờ admin duyệt: người khác không thấy, người viết thấy, chưa tính vào số bình luận', async () => {
    modelScore(0.6);
    const res = await comment(writer.auth, video._id, 'hơi khó nghe');
    expect(res.status).toBe(201);
    expect(res.body.data.moderationStatus).toBe('pending');
    expect(res.body.data.moderation).toMatchObject({ score: 0.6, source: 'model' });
    expect(await publicList()).toHaveLength(0);
    const mine = await request(app).get(`/api/comments/video/${video._id}`).set(writer.auth);
    expect(mine.body.data.map((c) => c.moderationStatus)).toEqual(['pending']);
    expect((await Video.findById(video._id)).commentCount).toBe(0);
    // Chủ video chưa nhận thông báo cho bình luận chưa được duyệt
    expect(await Notification.countDocuments({ userId: owner.user._id, type: 'new_comment' })).toBe(0);
  });

  test('điểm cao → ẩn luôn; admin vẫn thấy ở mục "Đã ẩn" và khôi phục được', async () => {
    modelScore(0.97);
    const res = await comment(writer.auth, video._id, 'rất độc hại');
    expect(res.body.data.moderationStatus).toBe('rejected');
    expect(await publicList()).toHaveLength(0);

    const admin = await createUser({ role: 'admin' });
    const hidden = await request(app).get('/api/admin/comments').query({ status: 'rejected' }).set(admin.auth);
    expect(hidden.body.data.map((c) => c._id)).toEqual([res.body.data._id]);
    const pending = await request(app).get('/api/admin/comments').set(admin.auth);
    expect(pending.body.data).toHaveLength(0);

    expect((await request(app).post(`/api/admin/comments/${res.body.data._id}/approve`).set(admin.auth)).status).toBe(200);
    expect(await publicList()).toHaveLength(1);
    expect((await Video.findById(video._id)).commentCount).toBe(1);
    // Người viết được báo là bình luận đã hiện lại
    const n = await Notification.findOne({ userId: writer.user._id, type: 'moderation' }).lean();
    expect(n.payload.context).toBe('comment_restored');
  });

  test('đúng ngưỡng: 0.5 → chờ duyệt, 0.85 → ẩn; đổi ngưỡng qua .env', async () => {
    modelScore(0.5);
    expect((await comment(writer.auth, video._id)).body.data.moderationStatus).toBe('pending');
    modelScore(0.85);
    expect((await comment(writer.auth, video._id)).body.data.moderationStatus).toBe('rejected');
    process.env.COMMENT_REJECT_THRESHOLD = '0.95';
    try {
      modelScore(0.9);
      expect((await comment(writer.auth, video._id)).body.data.moderationStatus).toBe('pending');
    } finally {
      delete process.env.COMMENT_REJECT_THRESHOLD;
    }
  });

  test('model không chạy → bộ lọc từ khoá: chửi tục chỉ vào hàng chờ, không tự ẩn; câu bình thường vẫn hiện', async () => {
    aiClient.postQuick.mockRejectedValue(Object.assign(new Error('down'), { code: 'ECONNREFUSED' }));
    const bad = await comment(writer.auth, video._id, 'đồ óc chó');
    expect(bad.body.data.moderationStatus).toBe('pending');
    expect(bad.body.data.moderation.source).toBe('keyword');
    expect((await comment(writer.auth, video._id, 'video hay')).body.data.moderationStatus).toBe('approved');
  });

  test('admin ẩn bình luận kèm lý do → người viết nhận thông báo có lý do', async () => {
    const admin = await createUser({ role: 'admin' });
    const c = (await comment(writer.auth, video._id, 'quảng cáo link lạ')).body.data;
    const res = await request(app).post(`/api/admin/comments/${c._id}/reject`).set(admin.auth).send({ reason: 'Spam quảng cáo' });
    expect(res.status).toBe(200);
    const n = await Notification.findOne({ userId: writer.user._id, type: 'moderation' }).lean();
    expect(n.payload).toMatchObject({ context: 'comment_hidden', reason: 'Spam quảng cáo', excerpt: 'quảng cáo link lạ' });
    expect((await Video.findById(video._id)).commentCount).toBe(0);
  });

  test('GET /admin/moderation/status: có model → engine "model"; chưa có model → "keyword" kèm lý do', async () => {
    const admin = await createUser({ role: 'admin' });
    aiClient.health.mockResolvedValue({ available: true, moderation_configured: true, moderation_loaded: true, moderation_model: '/moderation_model', moderation_labels: ['clean', 'toxic'] });
    let res = await request(app).get('/api/admin/moderation/status').set(admin.auth);
    expect(res.body.data).toMatchObject({ mode: 'auto', engine: 'model', reviewThreshold: 0.5, rejectThreshold: 0.85, labels: ['clean', 'toxic'] });
    aiClient.health.mockResolvedValue({ available: true, moderation_configured: false });
    res = await request(app).get('/api/admin/moderation/status').set(admin.auth);
    expect(res.body.data.engine).toBe('keyword');
    expect(res.body.data.reason).toMatch(/moderation_model/);
  });
});

// ─── Quyền xem ─────────────────────────────────────────────────────────────

describe('Vá quyền xem', () => {
  let owner; let friend; let stranger;
  beforeEach(async () => {
    owner = await createUser();
    friend = await createUser();
    stranger = await createUser();
    await Follow.create({ followerId: owner.user._id, followingId: friend.user._id });
    await Follow.create({ followerId: friend.user._id, followingId: owner.user._id });
  });

  test('bình luận + trả lời của video riêng tư / bạn bè / nháp: người không xem được video thì 404', async () => {
    for (const over of [{ visibility: 'private' }, { visibility: 'friends' }, { isDraft: true }]) {
      const v = await createVideo(owner.user, over);
      const c = await Comment.create({ videoId: v._id, userId: owner.user._id, content: 'bí mật' });
      await Comment.create({ videoId: v._id, userId: owner.user._id, content: 'trả lời', parentId: c._id });
      expect((await request(app).get(`/api/comments/video/${v._id}`).set(stranger.auth)).status).toBe(404);
      expect((await request(app).get(`/api/comments/video/${v._id}`)).status).toBe(404);
      expect((await request(app).get(`/api/comments/${c._id}/replies`).set(stranger.auth)).status).toBe(404);
      expect((await request(app).get(`/api/comments/video/${v._id}`).set(owner.auth)).body.data).toHaveLength(1);
    }
    const fr = await createVideo(owner.user, { visibility: 'friends' });
    await Comment.create({ videoId: fr._id, userId: owner.user._id, content: 'cho bạn bè' });
    expect((await request(app).get(`/api/comments/video/${fr._id}`).set(friend.auth)).body.data).toHaveLength(1);
  });

  test('bản lồng tiếng của video riêng tư: người lạ / khách 404, chủ video xem được', async () => {
    const v = await createVideo(owner.user, { visibility: 'private' });
    const t = await AudioTrack.create({ videoId: v._id, sourceLang: 'vi', targetLang: 'en', status: 'done' });
    expect((await request(app).get(`/api/dubbing/video/${v._id}`).set(stranger.auth)).status).toBe(404);
    expect((await request(app).get(`/api/dubbing/video/${v._id}`)).status).toBe(404);
    expect((await request(app).get(`/api/dubbing/${t._id}/status`).set(stranger.auth)).status).toBe(404);
    expect((await request(app).get(`/api/dubbing/video/${v._id}`).set(owner.auth)).body.data).toHaveLength(1);
    expect((await request(app).get(`/api/dubbing/${t._id}/status`).set(owner.auth)).status).toBe(200);
    // Video công khai: khách vẫn lấy được
    const pub = await createVideo(owner.user);
    expect((await request(app).get(`/api/dubbing/video/${pub._id}`)).status).toBe(200);
  });

  test('lượt xem / chia sẻ không tăng trên bản nháp, video riêng tư, video đã gỡ', async () => {
    for (const over of [{ isDraft: true }, { visibility: 'private' }, { moderationStatus: 'removed' }, { scheduledAt: new Date(Date.now() + 3600e3) }]) {
      const v = await createVideo(owner.user, over);
      expect((await request(app).post(`/api/videos/${v._id}/view`).set(stranger.auth).send({ watchTimeMs: 3000 })).status).toBe(404);
      expect((await request(app).post(`/api/videos/${v._id}/share`).set(stranger.auth).send({ method: 'copy_link' })).status).toBe(404);
      const fresh = await Video.findById(v._id).lean();
      expect([fresh.viewCount, fresh.shareCount]).toEqual([0, 0]);
    }
    const pub = await createVideo(owner.user);
    expect((await request(app).post(`/api/videos/${pub._id}/view`).send({ watchTimeMs: 3000 })).status).toBe(200);
    expect((await Video.findById(pub._id)).viewCount).toBe(1);
  });

  test('tiến trình tải lên: phải đăng nhập (token qua header hoặc ?token=)', async () => {
    expect((await request(app).get('/api/upload/abc/progress')).status).toBe(401);
    expect((await request(app).get('/api/upload/abc/progress').query({ token: 'sai' })).status).toBe(401);
  });
});

// ─── Giới hạn tần suất ─────────────────────────────────────────────────────

describe('Giới hạn tần suất theo tài khoản', () => {
  beforeAll(() => { process.env.RATE_LIMIT_IN_TEST = 'true'; });
  afterAll(() => { delete process.env.RATE_LIMIT_IN_TEST; });

  test('bình luận quá 12 lần / phút → 429; tài khoản khác không bị ảnh hưởng', async () => {
    const owner = await createUser();
    const spammer = await createUser();
    const normal = await createUser();
    const v = await createVideo(owner.user);
    const codes = [];
    for (let i = 0; i < 14; i += 1) codes.push((await comment(spammer.auth, v._id, `spam ${i}`)).status); // eslint-disable-line no-await-in-loop
    expect(codes.slice(0, 12).every((c) => c === 201)).toBe(true);
    expect(codes.slice(12)).toEqual([429, 429]);
    expect((await comment(normal.auth, v._id, 'bình thường')).status).toBe(201);
  });
});

// ─── Khoá tài khoản ────────────────────────────────────────────────────────

describe('Khoá tài khoản → ẩn nội dung', () => {
  let admin; let bad; let viewer; let video;
  beforeEach(async () => {
    admin = await createUser({ role: 'admin' });
    bad = await createUser();
    viewer = await createUser();
    video = await createVideo(bad.user, { title: 'xyzkhoa banhmi' });
  });
  const ban = (reason) => request(app).post(`/api/admin/users/${bad.user._id}/ban`).set(admin.auth).send({ reason });

  test('video biến khỏi feed, tìm kiếm, hồ sơ, link trực tiếp; mở khoá thì hiện lại', async () => {
    const other = await createVideo(viewer.user);
    const feedIds = async () => (await request(app).get('/api/feed/for-you')).body.data.map((v) => v._id);
    expect(await feedIds()).toEqual(expect.arrayContaining([String(video._id), String(other._id)]));

    expect((await ban('Spam')).status).toBe(200);
    const redis = require('../../src/config/redis');
    await redis.flushall?.();
    expect(await feedIds()).toEqual([String(other._id)]);
    expect((await request(app).get(`/api/videos/${video._id}`).set(viewer.auth)).status).toBe(404);
    expect((await request(app).get('/api/videos/search').query({ q: 'xyzkhoa' })).body.data).toHaveLength(0);
    expect((await request(app).get(`/api/users/${bad.user.username}`).set(viewer.auth)).status).toBe(404);
    // Admin vẫn xem được để xem xét
    expect((await request(app).get(`/api/videos/${video._id}`).set(admin.auth)).status).toBe(200);
    expect((await request(app).get(`/api/users/${bad.user.username}`).set(admin.auth)).status).toBe(200);

    expect((await request(app).post(`/api/admin/users/${bad.user._id}/unban`).set(admin.auth)).status).toBe(200);
    await redis.flushall?.();
    expect((await request(app).get(`/api/videos/${video._id}`).set(viewer.auth)).status).toBe(200);
    expect(await feedIds()).toEqual(expect.arrayContaining([String(video._id)]));
  });

  test('bình luận của người bị khoá bị ẩn; mở khoá thì hiện lại', async () => {
    const v = await createVideo(viewer.user);
    await comment(bad.auth, v._id, 'bình luận của người sắp bị khoá');
    const list = async () => (await request(app).get(`/api/comments/video/${v._id}`)).body.data;
    expect(await list()).toHaveLength(1);
    await ban();
    expect(await list()).toHaveLength(0);
    await request(app).post(`/api/admin/users/${bad.user._id}/unban`).set(admin.auth);
    expect(await list()).toHaveLength(1);
  });

  test('đăng nhập sau khi bị khoá → 403 kèm lý do; sai mật khẩu thì không lộ lý do', async () => {
    await ban('Đăng nội dung lừa đảo');
    const ok = await request(app).post('/api/auth/login').send({ email: bad.user.email, password: 'User@123456' });
    expect(ok.status).toBe(403);
    expect(ok.body.message).toContain('Đăng nội dung lừa đảo');
    const wrong = await request(app).post('/api/auth/login').send({ email: bad.user.email, password: 'Sai@123456' });
    expect(wrong.status).toBe(401);
    expect(wrong.body.message).not.toContain('lừa đảo');
  });
});

// ─── Thông báo khi bị xử lý ────────────────────────────────────────────────

describe('Thông báo cho chủ nội dung', () => {
  test('gỡ video kèm lý do → chủ video nhận thông báo; khôi phục → nhận thông báo đã khôi phục', async () => {
    const admin = await createUser({ role: 'admin' });
    const owner = await createUser();
    const v = await createVideo(owner.user, { title: 'Clip vi phạm', thumbnailUrl: 'http://x/t.jpg' });
    const res = await request(app).delete(`/api/admin/videos/${v._id}`).set(admin.auth).send({ reason: 'Vi phạm bản quyền' });
    expect(res.status).toBe(200);
    expect((await Video.findById(v._id)).removeReason).toBe('Vi phạm bản quyền');
    let n = await Notification.find({ userId: owner.user._id, type: 'moderation' }).sort({ _id: 1 }).lean();
    expect(n).toHaveLength(1);
    expect(n[0].payload).toMatchObject({ context: 'video_removed', reason: 'Vi phạm bản quyền', excerpt: 'Clip vi phạm', videoThumbnail: 'http://x/t.jpg' });
    expect((await AuditLog.findOne({ action: 'remove_video' }).lean()).details.reason).toBe('Vi phạm bản quyền');

    await request(app).post(`/api/admin/videos/${v._id}/approve`).set(admin.auth);
    n = await Notification.find({ userId: owner.user._id, type: 'moderation' }).sort({ _id: 1 }).lean();
    expect(n.map((x) => x.payload.context)).toEqual(['video_removed', 'video_restored']);
    expect((await Video.findById(v._id)).removeReason).toBeNull();
  });

  test('duyệt video chưa từng bị gỡ (chỉ đóng báo cáo) → không gửi thông báo', async () => {
    const admin = await createUser({ role: 'admin' });
    const owner = await createUser();
    const v = await createVideo(owner.user, { moderationStatus: 'flagged' });
    await request(app).post(`/api/admin/videos/${v._id}/approve`).set(admin.auth);
    expect(await Notification.countDocuments({ userId: owner.user._id })).toBe(0);
  });
});

// ─── Vai trò ───────────────────────────────────────────────────────────────

describe('Vai trò & kiểm duyệt viên', () => {
  let admin; let mod; let user;
  beforeEach(async () => {
    admin = await createUser({ role: 'admin' });
    mod = await createUser({ role: 'moderator' });
    user = await createUser();
  });

  test('kiểm duyệt viên: duyệt / gỡ video, bình luận, báo cáo được; không khoá, không đổi vai trò, không xem nhật ký / phân tích hệ thống', async () => {
    const v = await createVideo(user.user);
    const allowed = [
      ['get', '/api/admin/stats'], ['get', '/api/admin/videos'], ['get', '/api/admin/videos/flagged'], ['get', '/api/admin/reports'],
      ['get', '/api/admin/reports/comments'], ['get', '/api/admin/reports/users'], ['get', '/api/admin/comments'], ['get', '/api/admin/users'],
      ['delete', `/api/admin/videos/${v._id}`],
    ];
    for (const [m, url] of allowed) expect([url, (await request(app)[m](url).set(mod.auth)).status]).toEqual([url, 200]); // eslint-disable-line no-await-in-loop
    const denied = [
      ['post', `/api/admin/users/${user.user._id}/ban`], ['post', `/api/admin/users/${user.user._id}/unban`], ['post', `/api/admin/users/${user.user._id}/verify`],
      ['post', `/api/admin/users/${user.user._id}/unverify`], ['post', `/api/admin/users/${user.user._id}/role`], ['get', '/api/admin/audit-logs'], ['get', '/api/admin/analytics'],
    ];
    for (const [m, url] of denied) expect([url, (await request(app)[m](url).set(mod.auth)).status]).toEqual([url, 403]); // eslint-disable-line no-await-in-loop
  });

  test('kiểm duyệt viên không thấy email trong danh sách người dùng; admin thấy', async () => {
    const asMod = await request(app).get('/api/admin/users').set(mod.auth);
    expect(asMod.body.data.every((u) => u.email === undefined)).toBe(true);
    const asAdmin = await request(app).get('/api/admin/users').set(admin.auth);
    expect(asAdmin.body.data.every((u) => typeof u.email === 'string')).toBe(true);
  });

  test('admin đổi vai trò: user → moderator → user; ghi nhật ký; buộc đăng nhập lại', async () => {
    await User.updateOne({ _id: user.user._id }, { $set: { refreshTokens: [{ token: 'x' }] } }).catch(() => {});
    let res = await request(app).post(`/api/admin/users/${user.user._id}/role`).set(admin.auth).send({ role: 'moderator' });
    expect(res.status).toBe(200);
    expect(res.body.data.role).toBe('moderator');
    expect((await AuditLog.findOne({ action: 'change_role' }).lean()).details).toMatchObject({ previousRole: 'user', role: 'moderator' });
    res = await request(app).post(`/api/admin/users/${user.user._id}/role`).set(admin.auth).send({ role: 'moderator' });
    expect(res.status).toBe(409);
    res = await request(app).post(`/api/admin/users/${user.user._id}/role`).set(admin.auth).send({ role: 'user' });
    expect(res.body.data.role).toBe('user');
  });

  test('không tự đổi vai trò của mình; vai trò lạ → 400', async () => {
    expect((await request(app).post(`/api/admin/users/${admin.user._id}/role`).set(admin.auth).send({ role: 'user' })).status).toBe(403);
    expect((await request(app).post(`/api/admin/users/${user.user._id}/role`).set(admin.auth).send({ role: 'boss' })).status).toBe(400);
  });

  test('thu lại tích xanh', async () => {
    await request(app).post(`/api/admin/users/${user.user._id}/verify`).set(admin.auth);
    const res = await request(app).post(`/api/admin/users/${user.user._id}/unverify`).set(admin.auth);
    expect(res.status).toBe(200);
    expect((await User.findById(user.user._id)).isVerified).toBe(false);
    expect((await request(app).post(`/api/admin/users/${user.user._id}/unverify`).set(admin.auth)).status).toBe(409);
  });

  test('tìm kiếm + lọc + phân trang danh sách người dùng và video', async () => {
    await createUser({ username: 'tim_kiem_abc' });
    const banned = await createUser({ bannedAt: new Date() });
    let res = await request(app).get('/api/admin/users').query({ search: 'kiem_ab' }).set(admin.auth);
    expect(res.body.data.map((u) => u.username)).toEqual(['tim_kiem_abc']);
    res = await request(app).get('/api/admin/users').query({ status: 'banned' }).set(admin.auth);
    expect(res.body.data.map((u) => u.username)).toEqual([banned.user.username]);
    res = await request(app).get('/api/admin/users').query({ role: 'moderator' }).set(admin.auth);
    expect(res.body.data.map((u) => u.username)).toEqual([mod.user.username]);
    res = await request(app).get('/api/admin/users').query({ limit: 2, page: 2 }).set(admin.auth);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.pagination).toMatchObject({ page: 2, total: 5, totalPages: 3 });

    await createVideo(user.user, { title: 'Phở bò Hà Nội' });
    await createVideo(mod.user, { title: 'Khác' });
    res = await request(app).get('/api/admin/videos').query({ search: 'phở' }).set(admin.auth);
    expect(res.body.data.map((v) => v.title)).toEqual(['Phở bò Hà Nội']);
    res = await request(app).get('/api/admin/videos').query({ search: user.user.username }).set(admin.auth);
    expect(res.body.data.map((v) => v.title)).toEqual(['Phở bò Hà Nội']);
  });
});

// ─── Báo cáo bình luận / tài khoản ─────────────────────────────────────────

describe('Báo cáo bình luận', () => {
  let owner; let writer; let reporter; let admin; let video; let c;
  beforeEach(async () => {
    owner = await createUser();
    writer = await createUser();
    reporter = await createUser();
    admin = await createUser({ role: 'admin' });
    video = await createVideo(owner.user);
    c = (await comment(writer.auth, video._id, 'bình luận xấu')).body.data;
  });
  const report = (auth, id = c._id, body = { reason: 'harassment', note: 'xúc phạm' }) => request(app).post(`/api/comments/${id}/report`).set(auth).send(body);

  test('báo cáo được 1 lần; không báo cáo bình luận của mình; lý do sai → 400; khách → 401', async () => {
    expect((await report(reporter.auth)).status).toBe(201);
    expect((await report(reporter.auth)).status).toBe(409);
    expect((await report(writer.auth)).status).toBe(400);
    expect((await report(reporter.auth, c._id, { reason: 'khong_co' })).status).toBe(400);
    expect((await request(app).post(`/api/comments/${c._id}/report`).send({ reason: 'spam' })).status).toBe(401);
    expect(await ContentReport.countDocuments({ targetType: 'comment' })).toBe(1);
  });

  test('admin thấy báo cáo gom theo bình luận; ẩn bình luận → đóng báo cáo, người viết được báo', async () => {
    const r2 = await createUser();
    await report(reporter.auth);
    await report(r2.auth, c._id, { reason: 'spam' });
    const list = await request(app).get('/api/admin/reports/comments').set(admin.auth);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0]).toMatchObject({ _id: c._id, content: 'bình luận xấu', openReports: 2, reasonCounts: { harassment: 1, spam: 1 } });
    expect(list.body.data[0].userId.username).toBe(writer.user.username);
    expect(list.body.data[0].videoId.title).toBe(video.title);
    expect((await request(app).get('/api/admin/stats').set(admin.auth)).body.data.pendingCommentReports).toBe(1);

    await request(app).post(`/api/admin/comments/${c._id}/reject`).set(admin.auth).send({ reason: 'Quấy rối' });
    expect((await request(app).get('/api/admin/reports/comments').set(admin.auth)).body.data).toHaveLength(0);
    expect(await ContentReport.countDocuments({ status: 'resolved', resolution: 'hidden' })).toBe(2);
    expect((await Notification.findOne({ userId: writer.user._id, type: 'moderation' }).lean()).payload.reason).toBe('Quấy rối');
  });

  test('bỏ qua báo cáo → đóng báo cáo, bình luận giữ nguyên', async () => {
    await report(reporter.auth);
    const res = await request(app).post(`/api/admin/reports/comments/${c._id}/dismiss`).set(admin.auth);
    expect(res.body.data.resolved).toBe(1);
    expect((await Comment.findById(c._id)).moderationStatus).toBe('approved');
    expect((await request(app).post(`/api/admin/reports/comments/${c._id}/dismiss`).set(admin.auth)).status).toBe(404);
  });

  test('không báo cáo được bình luận trên video mình không xem được', async () => {
    const priv = await createVideo(owner.user, { visibility: 'private' });
    const hidden = await Comment.create({ videoId: priv._id, userId: owner.user._id, content: 'riêng tư' });
    expect((await report(reporter.auth, hidden._id)).status).toBe(404);
  });
});

describe('Báo cáo tài khoản', () => {
  test('báo cáo 1 lần / tài khoản; không báo cáo mình / admin; khoá tài khoản tự đóng báo cáo', async () => {
    const admin = await createUser({ role: 'admin' });
    const bad = await createUser();
    const a = await createUser();
    const b = await createUser();
    const rep = (who, target, reason = 'impersonation') => request(app).post(`/api/users/${target.username}/report`).set(who.auth).send({ reason, note: 'giả mạo' });
    expect((await rep(a, bad.user)).status).toBe(201);
    expect((await rep(a, bad.user)).status).toBe(409);
    expect((await rep(b, bad.user, 'spam')).status).toBe(201);
    expect((await rep(a, a.user)).status).toBe(400);
    expect((await rep(a, admin.user)).status).toBe(400);

    const list = await request(app).get('/api/admin/reports/users').set(admin.auth);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0]).toMatchObject({ username: bad.user.username, openReports: 2, reasonCounts: { impersonation: 1, spam: 1 } });

    await request(app).post(`/api/admin/users/${bad.user._id}/ban`).set(admin.auth).send({ reason: 'Giả mạo' });
    expect((await request(app).get('/api/admin/reports/users').set(admin.auth)).body.data).toHaveLength(0);
    expect(await ContentReport.countDocuments({ targetType: 'user', resolution: 'banned' })).toBe(2);
    // Tài khoản đã bị khoá → không báo cáo thêm được
    expect((await rep(b, bad.user, 'hate')).status).toBe(404);
  });
});
