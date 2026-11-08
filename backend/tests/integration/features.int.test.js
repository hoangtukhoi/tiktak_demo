/**
 * Tính năng mới (08/11/2026): báo cáo video, lưu video, tag tên (@), kiểm duyệt bình luận.
 */
jest.mock('../../src/services/ai/aiClient', () => ({
  ...jest.requireActual('../../src/services/ai/aiClient'),
  postQuick: jest.fn(),
}));

const request = require('supertest');
const app = require('../../src/app');
const aiClient = require('../../src/services/ai/aiClient');
const Video = require('../../src/models/Video');
const Comment = require('../../src/models/Comment');
const Report = require('../../src/models/Report');
const SavedVideo = require('../../src/models/SavedVideo');
const Notification = require('../../src/models/Notification');
const AuditLog = require('../../src/models/AuditLog');
const { useTestDb } = require('./helpers/db');
const { createUser, createVideo } = require('./helpers/factory');

useTestDb();

// Mặc định: AI service không chạy → dùng bộ lọc từ khoá
beforeEach(() => {
  aiClient.postQuick.mockRejectedValue(Object.assign(new Error('refused'), { code: 'ECONNREFUSED' }));
  delete process.env.COMMENT_MODERATION_MODE;
});

const aiReturns = (score, label = score >= 0.5 ? 'toxic' : 'clean') =>
  aiClient.postQuick.mockResolvedValue({ results: [{ score, label }] });

// ─── Báo cáo video ──────────────────────────────────────────────────────────

describe('POST /api/videos/:id/report', () => {
  const report = (auth, id, body) => request(app).post(`/api/videos/${id}/report`).set(auth).send(body);
  let owner;
  let fan;
  let video;
  beforeEach(async () => {
    owner = await createUser();
    fan = await createUser();
    video = await createVideo(owner.user);
  });

  test('lý do mới + ghi chú → 201, lưu đủ thông tin, trạng thái open', async () => {
    const res = await report(fan.auth, video._id, { reason: 'harassment', note: '  bắt nạt người khác  ' });
    expect(res.status).toBe(201);
    const r = await Report.findOne({ videoId: video._id });
    expect(r).toMatchObject({ reason: 'harassment', note: 'bắt nạt người khác', status: 'open' });
  });

  test.each([
    ['lý do không có trong danh sách → 400', { reason: 'boring' }, 400],
    ['thiếu lý do → 400', {}, 400],
    ['ghi chú 301 ký tự → 400', { reason: 'spam', note: 'a'.repeat(301) }, 400],
    ['ghi chú không phải chuỗi → 400', { reason: 'spam', note: 123 }, 400],
  ])('%s', async (_, body, status) => {
    expect((await report(fan.auth, video._id, body)).status).toBe(status);
  });

  test('tự báo cáo video của mình → 400', async () => {
    expect((await report(owner.auth, video._id, { reason: 'spam' })).status).toBe(400);
  });

  test('video riêng tư của người khác → 404', async () => {
    const priv = await createVideo(owner.user, { isPrivate: true });
    expect((await report(fan.auth, priv._id, { reason: 'spam' })).status).toBe(404);
  });

  test('khách → 401', async () => {
    expect((await report({}, video._id, { reason: 'spam' })).status).toBe(401);
  });

  test('admin duyệt video → đóng báo cáo, reportCount về 0; cần 3 báo cáo MỚI mới gắn cờ lại', async () => {
    const admin = await createUser({ role: 'admin' });
    const reporters = await Promise.all([1, 2, 3, 4].map(() => createUser()));
    for (const r of reporters.slice(0, 3)) await report(r.auth, video._id, { reason: 'spam' });
    expect((await Video.findById(video._id)).moderationStatus).toBe('flagged');

    const list = await request(app).get('/api/admin/reports').set(admin.auth);
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0]).toMatchObject({ openReports: 3, reasonCounts: { spam: 3 } });
    expect(list.body.data[0].reports[0].reporterId.username).toBeDefined();

    expect((await request(app).post(`/api/admin/videos/${video._id}/approve`).set(admin.auth)).status).toBe(200);
    const v = await Video.findById(video._id);
    expect(v).toMatchObject({ moderationStatus: 'approved', reportCount: 0 });
    expect(await Report.countDocuments({ status: 'resolved', resolution: 'kept' })).toBe(3);
    expect((await request(app).get('/api/admin/reports').set(admin.auth)).body.data).toHaveLength(0);

    await report(reporters[3].auth, video._id, { reason: 'hate' });
    expect((await Video.findById(video._id)).moderationStatus).toBe('approved');
  });

  test('video đã duyệt nhưng còn báo cáo mở → admin vẫn "giữ video" được (không 409)', async () => {
    const admin = await createUser({ role: 'admin' });
    await report(fan.auth, video._id, { reason: 'spam' });
    expect((await request(app).post(`/api/admin/videos/${video._id}/approve`).set(admin.auth)).status).toBe(200);
    expect((await request(app).post(`/api/admin/videos/${video._id}/approve`).set(admin.auth)).status).toBe(409);
  });

  test('admin gỡ video → báo cáo đóng với kết quả removed', async () => {
    const admin = await createUser({ role: 'admin' });
    await report(fan.auth, video._id, { reason: 'violence' });
    await request(app).delete(`/api/admin/videos/${video._id}`).set(admin.auth);
    expect(await Report.findOne({ videoId: video._id })).toMatchObject({ status: 'resolved', resolution: 'removed' });
  });
});

// ─── Lưu video ─────────────────────────────────────────────────────────────

describe('Lưu video (bookmark)', () => {
  const save = (auth, id) => request(app).post(`/api/videos/${id}/save`).set(auth);
  let owner;
  let fan;
  let video;
  beforeEach(async () => {
    owner = await createUser();
    fan = await createUser();
    video = await createVideo(owner.user);
  });

  test('bấm lưu → saved=true, saveCount=1; bấm lần nữa → bỏ lưu, saveCount=0', async () => {
    let res = await save(fan.auth, video._id);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ saved: true, saveCount: 1 });
    res = await save(fan.auth, video._id);
    expect(res.body.data).toEqual({ saved: false, saveCount: 0 });
    expect(await SavedVideo.countDocuments()).toBe(0);
  });

  test('2 request lưu cùng lúc → chỉ 1 bản ghi, saveCount không vượt 1', async () => {
    await Promise.all([save(fan.auth, video._id), save(fan.auth, video._id)]);
    const count = await SavedVideo.countDocuments();
    expect(count).toBeLessThanOrEqual(1);
    expect((await Video.findById(video._id)).saveCount).toBe(count);
  });

  test('video riêng tư người khác → 404; id sai → 400; khách → 401', async () => {
    const priv = await createVideo(owner.user, { isPrivate: true });
    expect((await save(fan.auth, priv._id)).status).toBe(404);
    expect((await save(fan.auth, 'abc')).status).toBe(400);
    expect((await save({}, video._id)).status).toBe(401);
  });

  test('GET /users/me/saved: mới lưu trước, bỏ video đã bị gỡ/riêng tư, có cờ isSaved', async () => {
    const v2 = await createVideo(owner.user);
    const v3 = await createVideo(owner.user);
    await save(fan.auth, video._id);
    await save(fan.auth, v2._id);
    await save(fan.auth, v3._id);
    await Video.updateOne({ _id: v3._id }, { isPrivate: true });

    const res = await request(app).get('/api/users/me/saved').set(fan.auth);
    expect(res.status).toBe(200);
    expect(res.body.data.map((v) => v._id)).toEqual([String(v2._id), String(video._id)]);
    expect(res.body.data.every((v) => v.isSaved)).toBe(true);
    expect(res.body.data[0].userId.username).toBe(owner.user.username);
  });

  test('danh sách đã lưu chỉ chủ tài khoản xem: khách → 401', async () => {
    expect((await request(app).get('/api/users/me/saved')).status).toBe(401);
  });

  test('feed và chi tiết video trả isSaved / isLiked đúng với người xem', async () => {
    await save(fan.auth, video._id);
    await request(app).post(`/api/videos/${video._id}/like`).set(fan.auth);
    const detail = await request(app).get(`/api/videos/${video._id}`).set(fan.auth);
    expect(detail.body.data).toMatchObject({ isSaved: true, isLiked: true });
    const feed = await request(app).get('/api/feed/for-you').set(fan.auth);
    expect(feed.body.data[0]).toMatchObject({ isSaved: true, isLiked: true });
    // Người khác cùng xem feed (cache theo user) → không bị lẫn cờ
    const other = await createUser();
    const feed2 = await request(app).get('/api/feed/for-you').set(other.auth);
    expect(feed2.body.data[0]).toMatchObject({ isSaved: false, isLiked: false });
  });

  test('admin xoá hẳn video → xoá luôn bản ghi đã lưu', async () => {
    const admin = await createUser({ role: 'admin' });
    await save(fan.auth, video._id);
    await request(app).delete(`/api/videos/${video._id}`).set(admin.auth);
    expect(await SavedVideo.countDocuments()).toBe(0);
  });
});

// ─── Tag tên (@username) ───────────────────────────────────────────────────

describe('Tag tên trong bình luận', () => {
  const comment = (auth, body) => request(app).post('/api/comments').set(auth).send(body);
  let owner;
  let fan;
  let friend;
  let video;
  beforeEach(async () => {
    owner = await createUser();
    fan = await createUser();
    friend = await createUser({ username: 'Ban_Than' });
    video = await createVideo(owner.user);
  });

  test('tag người khác (không phân biệt hoa thường) → lưu mentions + gửi thông báo mention', async () => {
    const res = await comment(fan.auth, { videoId: video._id, content: 'xem nè @ban_than @ban_than' });
    expect(res.status).toBe(201);
    expect(res.body.data.mentions).toEqual([{ userId: String(friend.user._id), username: 'Ban_Than' }]);
    const n = await Notification.find({ userId: friend.user._id });
    expect(n).toHaveLength(1);
    expect(n[0]).toMatchObject({ type: 'mention', payload: { context: 'comment', actorUsername: fan.user.username } });
  });

  test('tự tag mình, email, username không tồn tại → không có ai được tag', async () => {
    const res = await comment(fan.auth, { videoId: video._id, content: `@${fan.user.username} mail a@ban_than.com @khong_ton_tai` });
    expect(res.body.data.mentions).toEqual([]);
    expect(await Notification.countDocuments({ type: 'mention' })).toBe(0);
  });

  test('tag chủ video → chủ video chỉ nhận 1 thông báo (mention), không nhận thêm new_comment', async () => {
    await comment(fan.auth, { videoId: video._id, content: `@${owner.user.username} ơi` });
    const n = await Notification.find({ userId: owner.user._id });
    expect(n.map((x) => x.type)).toEqual(['mention']);
  });

  test('tag người bị khoá → bỏ qua', async () => {
    const banned = await createUser({ bannedAt: new Date() });
    const res = await comment(fan.auth, { videoId: video._id, content: `@${banned.user.username}` });
    expect(res.body.data.mentions).toEqual([]);
  });

  test('GET /users/mention-suggest: khớp đầu username, ưu tiên người mình theo dõi, không gợi ý chính mình', async () => {
    const a = await createUser({ username: 'bananas', followerCount: 100 });
    await createUser({ username: 'ban_other', followerCount: 5 });
    await request(app).post(`/api/users/${friend.user.username}/follow`).set(fan.auth);
    const res = await request(app).get('/api/users/mention-suggest?q=@ban').set(fan.auth);
    expect(res.status).toBe(200);
    expect(res.body.data[0].username).toBe('Ban_Than');
    expect(res.body.data.map((u) => u.username)).toContain(a.user.username);
    const none = await request(app).get('/api/users/mention-suggest?q=a.*').set(fan.auth);
    expect(none.body.data).toEqual([]);
  });
});

// ─── Kiểm duyệt bình luận ──────────────────────────────────────────────────

describe('Kiểm duyệt bình luận', () => {
  const comment = (auth, body) => request(app).post('/api/comments').set(auth).send(body);
  let owner;
  let fan;
  let admin;
  let video;
  beforeEach(async () => {
    owner = await createUser();
    fan = await createUser();
    admin = await createUser({ role: 'admin' });
    video = await createVideo(owner.user);
  });

  test('AI không chạy + có từ chửi tục → chờ duyệt: không tăng bộ đếm, không thông báo, người khác không thấy', async () => {
    const res = await comment(fan.auth, { videoId: video._id, content: 'đ.m video dở' });
    expect(res.status).toBe(201);
    expect(res.body.data.moderationStatus).toBe('pending');
    expect(res.body.data.moderation.source).toBe('keyword');
    expect((await Video.findById(video._id)).commentCount).toBe(0);
    expect(await Notification.countDocuments()).toBe(0);

    const asGuest = await request(app).get(`/api/comments/video/${video._id}`);
    expect(asGuest.body.data).toHaveLength(0);
    const asAuthor = await request(app).get(`/api/comments/video/${video._id}`).set(fan.auth);
    expect(asAuthor.body.data).toHaveLength(1);
  });

  test('model chấm điểm thấp → hiện ngay', async () => {
    aiReturns(0.1);
    const res = await comment(fan.auth, { videoId: video._id, content: 'video hay quá' });
    expect(res.body.data).toMatchObject({ moderationStatus: 'approved', moderation: { source: 'model', score: 0.1 } });
    expect((await Video.findById(video._id)).commentCount).toBe(1);
  });

  test.each([
    ['semi', 0.95, 'pending'],
    ['semi', 0.6, 'pending'],
    ['semi', 0.49, 'approved'],
    ['auto', 0.95, 'rejected'],
    ['auto', 0.85, 'rejected'],
    ['auto', 0.6, 'pending'],
    ['off', 0.99, 'approved'],
  ])('chế độ %s, điểm %p → %s', async (mode, score, status) => {
    process.env.COMMENT_MODERATION_MODE = mode;
    aiReturns(score);
    const res = await comment(fan.auth, { videoId: video._id, content: 'nội dung bất kỳ' });
    expect(res.body.data.moderationStatus).toBe(status);
  });

  test('model bỏ sót chửi viết tắt → bộ lọc từ khoá vẫn đưa vào hàng chờ', async () => {
    aiReturns(0.05);
    const res = await comment(fan.auth, { videoId: video._id, content: 'vcl thật' });
    expect(res.body.data.moderationStatus).toBe('pending');
  });

  test('admin duyệt bình luận chờ → tăng bộ đếm, gửi thông báo đã hoãn, ghi audit log', async () => {
    const tagged = await createUser({ username: 'duoc_tag' });
    const { body } = await comment(fan.auth, { videoId: video._id, content: 'vl @duoc_tag' });
    expect(body.data.moderationStatus).toBe('pending');

    const queue = await request(app).get('/api/admin/comments?status=pending').set(admin.auth);
    expect(queue.status).toBe(200);
    expect(queue.body.data[0]).toMatchObject({ _id: body.data._id, videoId: { title: video.title } });

    const res = await request(app).post(`/api/admin/comments/${body.data._id}/approve`).set(admin.auth);
    expect(res.status).toBe(200);
    expect((await Video.findById(video._id)).commentCount).toBe(1);
    expect(await Notification.countDocuments({ userId: owner.user._id, type: 'new_comment' })).toBe(1);
    expect(await Notification.countDocuments({ userId: tagged.user._id, type: 'mention' })).toBe(1);
    expect(await AuditLog.countDocuments({ action: 'approve_comment' })).toBe(1);
    // Duyệt lần 2 → 409, không đếm thêm
    expect((await request(app).post(`/api/admin/comments/${body.data._id}/approve`).set(admin.auth)).status).toBe(409);
    expect((await Video.findById(video._id)).commentCount).toBe(1);
  });

  test('admin ẩn bình luận đã hiện → giảm bộ đếm; xoá bình luận bị ẩn không trừ thêm', async () => {
    aiReturns(0.1);
    const { body } = await comment(fan.auth, { videoId: video._id, content: 'bình thường' });
    expect((await Video.findById(video._id)).commentCount).toBe(1);
    await request(app).post(`/api/admin/comments/${body.data._id}/reject`).set(admin.auth);
    expect((await Comment.findById(body.data._id)).moderationStatus).toBe('rejected');
    expect((await Video.findById(video._id)).commentCount).toBe(0);
    expect((await request(app).delete(`/api/comments/${body.data._id}`).set(fan.auth)).status).toBe(200);
    expect((await Video.findById(video._id)).commentCount).toBe(0);
  });

  test('2 admin duyệt cùng lúc → bộ đếm chỉ tăng 1', async () => {
    const { body } = await comment(fan.auth, { videoId: video._id, content: 'đm' });
    const admin2 = await createUser({ role: 'admin' });
    await Promise.all([
      request(app).post(`/api/admin/comments/${body.data._id}/approve`).set(admin.auth),
      request(app).post(`/api/admin/comments/${body.data._id}/approve`).set(admin2.auth),
    ]);
    expect((await Video.findById(video._id)).commentCount).toBe(1);
  });

  test('không thích / trả lời được bình luận đang chờ của người khác', async () => {
    const { body } = await comment(fan.auth, { videoId: video._id, content: 'đm' });
    const other = await createUser();
    expect((await request(app).post(`/api/comments/${body.data._id}/like`).set(other.auth)).status).toBe(404);
    expect((await comment(other.auth, { videoId: video._id, content: 'rep', parentId: body.data._id })).status).toBe(404);
  });

  test('chủ video xoá được bình luận trên video của mình; người lạ thì không', async () => {
    aiReturns(0.1);
    const { body } = await comment(fan.auth, { videoId: video._id, content: 'hi' });
    const stranger = await createUser();
    expect((await request(app).delete(`/api/comments/${body.data._id}`).set(stranger.auth)).status).toBe(403);
    expect((await request(app).delete(`/api/comments/${body.data._id}`).set(owner.auth)).status).toBe(200);
  });

  test('user thường không vào được hàng chờ kiểm duyệt', async () => {
    expect((await request(app).get('/api/admin/comments').set(fan.auth)).status).toBe(403);
  });

  test('stats có số bình luận chờ duyệt', async () => {
    await comment(fan.auth, { videoId: video._id, content: 'đm' });
    const res = await request(app).get('/api/admin/stats').set(admin.auth);
    expect(res.body.data.pendingComments).toBe(1);
  });
});

// ─── Đăng lại & đã tim ─────────────────────────────────────────────────────

describe('Đăng lại (repost)', () => {
  const Repost = require('../../src/models/Repost');
  const Follow = require('../../src/models/Follow');
  const repost = (auth, id) => request(app).post(`/api/videos/${id}/repost`).set(auth);
  let owner;
  let fan;
  let follower;
  let video;
  beforeEach(async () => {
    owner = await createUser();
    fan = await createUser();
    follower = await createUser();
    video = await createVideo(owner.user);
    await Follow.create({ followerId: follower.user._id, followingId: fan.user._id });
  });

  test('bấm đăng lại → reposted, repostCount=1, chủ video nhận thông báo; bấm lại → bỏ đăng lại', async () => {
    let res = await repost(fan.auth, video._id);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ reposted: true, repostCount: 1 });
    expect(await Notification.countDocuments({ userId: owner.user._id, type: 'repost' })).toBe(1);
    res = await repost(fan.auth, video._id);
    expect(res.body.data).toEqual({ reposted: false, repostCount: 0 });
    // Bật lại trong ngày → không gửi thêm thông báo (chống spam)
    await repost(fan.auth, video._id);
    expect(await Notification.countDocuments({ type: 'repost' })).toBe(1);
  });

  test('không đăng lại được video của mình (400), video riêng tư (404), khách (401)', async () => {
    expect((await repost(owner.auth, video._id)).status).toBe(400);
    const priv = await createVideo(owner.user, { isPrivate: true });
    expect((await repost(fan.auth, priv._id)).status).toBe(404);
    expect((await repost({}, video._id)).status).toBe(401);
  });

  test('2 request cùng lúc → chỉ 1 bản ghi, bộ đếm khớp', async () => {
    await Promise.all([repost(fan.auth, video._id), repost(fan.auth, video._id)]);
    const n = await Repost.countDocuments();
    expect((await Video.findById(video._id)).repostCount).toBe(n);
  });

  test('người theo dõi thấy video được đăng lại trong feed "Đang theo dõi" kèm repostedBy', async () => {
    await repost(fan.auth, video._id);
    const res = await request(app).get('/api/feed/following').set(follower.auth);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]._id).toBe(String(video._id));
    expect(res.body.data[0].repostedBy.map((u) => u.username)).toEqual([fan.user.username]);
    expect(res.body.data[0].repostedByCount).toBe(1);
    expect(res.body.data[0].userId.username).toBe(owner.user.username);
  });

  test('feed "Đang theo dõi" xếp video đăng lại theo thời điểm đăng lại, không lặp video', async () => {
    const other = await createUser();
    await Follow.create({ followerId: follower.user._id, followingId: other.user._id });
    const older = await createVideo(owner.user, { createdAt: new Date(Date.now() - 86400e3) });
    await createVideo(other.user); // video mới của người đang theo dõi
    await repost(fan.auth, older._id); // đăng lại video cũ → lên đầu
    await repost(other.auth, older._id);
    const res = await request(app).get('/api/feed/following').set(follower.auth);
    const ids = res.body.data.map((v) => v._id);
    expect(ids[0]).toBe(String(older._id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(res.body.data[0].repostedByCount).toBe(2);
  });

  test('chi tiết video / feed cho người xem không theo dõi ai → repostedBy rỗng; người đăng lại thấy isReposted', async () => {
    await repost(fan.auth, video._id);
    const stranger = await createUser();
    expect((await request(app).get(`/api/videos/${video._id}`).set(stranger.auth)).body.data.repostedBy).toEqual([]);
    expect((await request(app).get(`/api/videos/${video._id}`).set(fan.auth)).body.data.isReposted).toBe(true);
  });

  test('tab "Đăng lại" trên hồ sơ: công khai, mới nhất trước, bỏ video đã thành riêng tư', async () => {
    const v2 = await createVideo(owner.user);
    const v3 = await createVideo(owner.user);
    await repost(fan.auth, video._id);
    await repost(fan.auth, v2._id);
    await repost(fan.auth, v3._id);
    await Video.updateOne({ _id: v3._id }, { isPrivate: true });
    const res = await request(app).get(`/api/users/${fan.user.username}/reposts`);
    expect(res.status).toBe(200);
    expect(res.body.data.map((v) => v._id)).toEqual([String(v2._id), String(video._id)]);
    expect((await request(app).get('/api/users/khong_co_ai/reposts')).status).toBe(404);
  });
});

describe('Tab "Đã tim"', () => {
  test('chỉ chủ tài khoản xem được, mới thích trước, có isLiked', async () => {
    const owner = await createUser();
    const fan = await createUser();
    const a = await createVideo(owner.user);
    const b = await createVideo(owner.user);
    await request(app).post(`/api/videos/${a._id}/like`).set(fan.auth);
    await request(app).post(`/api/videos/${b._id}/like`).set(fan.auth);
    const res = await request(app).get('/api/users/me/liked').set(fan.auth);
    expect(res.body.data.map((v) => v._id)).toEqual([String(b._id), String(a._id)]);
    expect(res.body.data.every((v) => v.isLiked)).toBe(true);
    expect((await request(app).get('/api/users/me/liked')).status).toBe(401);
    expect((await request(app).get('/api/users/me/liked?cursor=abc').set(fan.auth)).status).toBe(400);
  });
});

// ─── Ghim video ────────────────────────────────────────────────────────────

describe('Ghim video lên đầu hồ sơ', () => {
  const pin = (who, id) => request(app).post(`/api/videos/${id}/pin`).set(who.auth);

  test('video ghim nằm đầu danh sách (ghim sau đứng trước), bỏ ghim thì về chỗ cũ', async () => {
    const owner = await createUser();
    const vids = [];
    for (let i = 0; i < 5; i += 1) vids.push(await createVideo(owner.user));
    const list = async () => (await request(app).get(`/api/users/${owner.user.username}/videos`)).body.data;

    expect((await pin(owner, vids[0]._id)).body.data.pinned).toBe(true);
    await pin(owner, vids[2]._id);
    const ids = (await list()).map((v) => v._id);
    expect(ids.slice(0, 2)).toEqual([String(vids[2]._id), String(vids[0]._id)]);
    expect(ids).toHaveLength(5);
    expect((await list())[0].pinnedAt).toBeTruthy();

    expect((await pin(owner, vids[2]._id)).body.data.pinned).toBe(false);
    expect((await list()).map((v) => v._id).slice(0, 2)).toEqual([String(vids[0]._id), String(vids[4]._id)]);
  });

  test('tối đa 3 video; không ghim được video của người khác; khách 401', async () => {
    const owner = await createUser();
    const other = await createUser();
    const vids = [];
    for (let i = 0; i < 4; i += 1) vids.push(await createVideo(owner.user));
    for (let i = 0; i < 3; i += 1) expect((await pin(owner, vids[i]._id)).status).toBe(200);
    expect((await pin(owner, vids[3]._id)).status).toBe(409);
    expect((await pin(other, vids[3]._id)).status).toBe(404);
    expect((await request(app).post(`/api/videos/${vids[3]._id}/pin`)).status).toBe(401);
    expect((await pin(owner, 'abc')).status).toBe(400);
  });

  test('phân trang: video ghim không lặp lại ở trang sau', async () => {
    const owner = await createUser();
    const vids = [];
    for (let i = 0; i < 5; i += 1) vids.push(await createVideo(owner.user));
    await pin(owner, vids[1]._id);
    const p1 = (await request(app).get(`/api/users/${owner.user.username}/videos?limit=3`)).body;
    const p2 = (await request(app).get(`/api/users/${owner.user.username}/videos?limit=3&cursor=${p1.pagination.nextCursor}`)).body;
    const all = [...p1.data, ...p2.data].map((v) => v._id);
    expect(all[0]).toBe(String(vids[1]._id));
    expect(new Set(all).size).toBe(5);
  });
});
