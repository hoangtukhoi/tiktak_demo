/**
 * Backend cho giao diện mới (09/11/2026): tải lên kèm tuỳ chọn (ảnh bìa, ai được xem, hẹn giờ,
 * bản nháp, tag người, lồng tiếng tự động), quyền xem video "bạn bè", bản nháp, sắp xếp phổ biến...
 */
jest.mock('../../src/services/storage.service', () => ({
  ...jest.requireActual('../../src/services/storage.service'),
  uploadBuffer: jest.fn(async (key, buf, type, bucket) => `http://s3.test/${bucket}/${key}`),
}));
jest.mock('../../src/jobs/queue', () => ({
  transcodeQueue: { add: jest.fn(async () => ({ id: 'job-1' })) },
  dubbingQueue: { add: jest.fn(async () => ({ id: 'dub-1' })) },
  setProgress: jest.fn(),
  getProgress: jest.fn(),
}));

const request = require('supertest');
const app = require('../../src/app');
const storage = require('../../src/services/storage.service');
const { dubbingQueue } = require('../../src/jobs/queue');
const Video = require('../../src/models/Video');
const Follow = require('../../src/models/Follow');
const AudioTrack = require('../../src/models/AudioTrack');
const Notification = require('../../src/models/Notification');
const videoService = require('../../src/services/video.service');
const { useTestDb } = require('./helpers/db');
const { createUser, createVideo } = require('./helpers/factory');

useTestDb();

const MP4 = Buffer.from('00000018667479706d703432', 'hex');
const JPG = Buffer.from('ffd8ffe000104a464946', 'hex');

const upload = (auth, fields = {}, { cover = false } = {}) => {
  let req = request(app).post('/api/upload').set(auth).attach('video', MP4, { filename: 'clip.mp4', contentType: 'video/mp4' });
  if (cover) req = req.attach('thumbnail', JPG, { filename: 'cover.jpg', contentType: 'image/jpeg' });
  Object.entries(fields).forEach(([k, v]) => { req = req.field(k, typeof v === 'object' ? JSON.stringify(v) : String(v)); });
  return req;
};

const befriend = async (a, b) => {
  await Follow.create({ followerId: a._id, followingId: b._id });
  await Follow.create({ followerId: b._id, followingId: a._id });
};

// ─── POST /api/upload ──────────────────────────────────────────────────────

describe('POST /api/upload — tuỳ chọn của giao diện mới', () => {
  test('lưu visibility, cho phép Duet, ngôn ngữ, phụ đề, lồng tiếng và ảnh bìa tự chọn', async () => {
    const me = await createUser();
    const res = await upload(me.auth, {
      title: 'Clip mới', description: 'mô tả', hashtags: ['a', 'b'], visibility: 'friends', isPrivate: true,
      allowComment: false, allowDuet: false, sourceLang: 'vi', autoCaption: true, dubLangs: ['en', 'ja', 'vi', 'zz'],
    }, { cover: true });
    expect(res.status).toBe(201);
    const v = await Video.findById(res.body.data.videoId).lean();
    expect(v).toMatchObject({
      visibility: 'friends', isPrivate: true, allowComment: false, allowDuet: false, isDraft: false, scheduledAt: null,
      sourceLang: 'vi', autoCaption: true, dubLangs: ['en', 'ja'], hashtags: ['a', 'b'], customThumbnail: true,
    });
    // Ảnh bìa vào bucket thumbnails
    expect(v.thumbnailUrl).toMatch(/thumbnails\/.+\/cover-.+\.jpg$/);
    expect(storage.uploadBuffer).toHaveBeenCalledTimes(2);
  });

  test('không gửi visibility → suy ra từ isPrivate; mặc định công khai', async () => {
    const me = await createUser();
    const a = await upload(me.auth, { title: 'a', isPrivate: true });
    const b = await upload(me.auth, { title: 'b' });
    expect((await Video.findById(a.body.data.videoId)).visibility).toBe('private');
    expect((await Video.findById(b.body.data.videoId)).toObject()).toMatchObject({ visibility: 'public', isPrivate: false, customThumbnail: false });
  });

  test('visibility lạ → 400; ảnh bìa không phải ảnh → 400', async () => {
    const me = await createUser();
    expect((await upload(me.auth, { title: 'x', visibility: 'everyone' })).status).toBe(400);
    const bad = await request(app).post('/api/upload').set(me.auth)
      .attach('video', MP4, { filename: 'c.mp4', contentType: 'video/mp4' })
      .attach('thumbnail', MP4, { filename: 'c.mp4', contentType: 'video/mp4' });
    expect(bad.status).toBe(400);
  });

  test('hẹn giờ: lưu scheduledAt; giờ đã qua → đăng ngay; quá 30 ngày / sai định dạng → 400; bản nháp bỏ hẹn giờ', async () => {
    const me = await createUser();
    const at = new Date(Date.now() + 3600e3).toISOString();
    const r1 = await upload(me.auth, { title: 's', scheduledAt: at });
    expect((await Video.findById(r1.body.data.videoId)).scheduledAt.toISOString()).toBe(at);
    const r2 = await upload(me.auth, { title: 's', scheduledAt: new Date(Date.now() - 60e3).toISOString() });
    expect((await Video.findById(r2.body.data.videoId)).scheduledAt).toBeNull();
    expect((await upload(me.auth, { title: 's', scheduledAt: new Date(Date.now() + 31 * 864e5).toISOString() })).status).toBe(400);
    expect((await upload(me.auth, { title: 's', scheduledAt: 'mai' })).status).toBe(400);
    const r3 = await upload(me.auth, { title: 's', scheduledAt: at, isDraft: true });
    expect((await Video.findById(r3.body.data.videoId)).toObject()).toMatchObject({ isDraft: true, scheduledAt: null });
  });

  test('tag người qua mảng id (ô "Gắn thẻ") gộp với @tên trong mô tả, bỏ chính mình / id sai / trùng', async () => {
    const me = await createUser();
    const a = await createUser({ username: 'alice_tag' });
    const b = await createUser({ username: 'bob_tag' });
    const res = await upload(me.auth, {
      title: 'Đi chơi với @alice_tag', mentions: [String(a.user._id), String(b.user._id), String(me.user._id), 'abc', String(a.user._id)],
    });
    const v = await Video.findById(res.body.data.videoId).lean();
    expect(v.mentions.map((m) => m.username).sort()).toEqual(['alice_tag', 'bob_tag']);
  });

  test('người tắt quyền được tag → không bị tag dù được chọn trong ô "Gắn thẻ"', async () => {
    const me = await createUser();
    const shy = await createUser({ privacy: { mentionPermission: 'no_one' } });
    const res = await upload(me.auth, { title: 'x', mentions: [String(shy.user._id)] });
    expect((await Video.findById(res.body.data.videoId)).mentions).toHaveLength(0);
  });
});

// ─── Ai được xem ───────────────────────────────────────────────────────────

describe('Video "bạn bè" / bản nháp / hẹn giờ', () => {
  let owner; let friend; let fan; let stranger;
  beforeEach(async () => {
    owner = await createUser();
    friend = await createUser();
    fan = await createUser(); // chỉ theo dõi một chiều
    stranger = await createUser();
    await befriend(owner.user, friend.user);
    await Follow.create({ followerId: fan.user._id, followingId: owner.user._id });
  });
  const get = (who, id) => request(app).get(`/api/videos/${id}`).set(who ? who.auth : {});

  test('video bạn bè: chủ + bạn bè xem được; người theo dõi 1 chiều, người lạ, khách → 404', async () => {
    const v = await createVideo(owner.user, { visibility: 'friends' });
    expect(v.isPrivate).toBe(true); // hook đồng bộ → không lọt vào feed công khai
    expect((await get(owner, v._id)).status).toBe(200);
    expect((await get(friend, v._id)).status).toBe(200);
    expect((await get(fan, v._id)).status).toBe(404);
    expect((await get(stranger, v._id)).status).toBe(404);
    expect((await get(null, v._id)).status).toBe(404);
  });

  test('bạn bè thấy video bạn bè trên hồ sơ và feed Đang theo dõi; người khác thì không', async () => {
    const pub = await createVideo(owner.user);
    const fr = await createVideo(owner.user, { visibility: 'friends' });
    await createVideo(owner.user, { visibility: 'private' });
    const ids = (res) => res.body.data.map((x) => x._id).sort();

    const forFriend = await request(app).get(`/api/users/${owner.user._id}/videos`).set(friend.auth);
    expect(ids(forFriend)).toEqual([String(pub._id), String(fr._id)].sort());
    const forFan = await request(app).get(`/api/users/${owner.user._id}/videos`).set(fan.auth);
    expect(ids(forFan)).toEqual([String(pub._id)]);

    const feedFriend = await request(app).get('/api/feed/following').set(friend.auth);
    expect(ids(feedFriend)).toEqual([String(pub._id), String(fr._id)].sort());
    const feedFan = await request(app).get('/api/feed/following').set(fan.auth);
    expect(ids(feedFan)).toEqual([String(pub._id)]);
    // For You chỉ có video công khai
    const fy = await request(app).get('/api/feed/for-you').set(friend.auth);
    expect(ids(fy)).toEqual([String(pub._id)]);
  });

  test('bản nháp & video hẹn giờ chưa tới giờ: người khác không thấy ở đâu cả; tới giờ thì hiện', async () => {
    const draft = await createVideo(owner.user, { isDraft: true, title: 'nhap bun bo' });
    const later = await createVideo(owner.user, { scheduledAt: new Date(Date.now() + 3600e3), title: 'hen bun bo' });
    const past = await createVideo(owner.user, { scheduledAt: new Date(Date.now() - 60e3), title: 'da toi bun bo' });
    expect((await get(stranger, draft._id)).status).toBe(404);
    expect((await get(stranger, later._id)).status).toBe(404);
    expect((await get(stranger, past._id)).status).toBe(200);
    expect((await get(owner, draft._id)).status).toBe(200);

    const profile = await request(app).get(`/api/users/${owner.user.username}/videos`).set(stranger.auth);
    expect(profile.body.data.map((x) => x._id)).toEqual([String(past._id)]);
    const fy = await request(app).get('/api/feed/for-you');
    expect(fy.body.data.map((x) => x._id)).toEqual([String(past._id)]);

    // Chủ kênh: tab Video có video hẹn giờ (badge "Đã lên lịch"), không có bản nháp
    const mine = await request(app).get(`/api/users/${owner.user._id}/videos`).set(owner.auth);
    expect(mine.body.data.map((x) => x._id).sort()).toEqual([String(later._id), String(past._id)].sort());
  });

  test('GET /users/me/drafts: chỉ bản nháp của mình; khách 401', async () => {
    const d1 = await createVideo(owner.user, { isDraft: true });
    await createVideo(owner.user);
    await createVideo(friend.user, { isDraft: true });
    const res = await request(app).get('/api/users/me/drafts').set(owner.auth);
    expect(res.status).toBe(200);
    expect(res.body.data.map((x) => x._id)).toEqual([String(d1._id)]);
    expect((await request(app).get('/api/users/me/drafts')).status).toBe(401);
  });

  test('PATCH /videos/:id: đổi visibility (đồng bộ isPrivate), đăng bản nháp → báo người được tag + lồng tiếng tự động', async () => {
    const tagged = await createUser();
    const v = await createVideo(owner.user, {
      isDraft: true, mentions: [{ userId: tagged.user._id, username: tagged.user.username }], dubLangs: ['en'], sourceLang: 'vi',
    });
    let res = await request(app).patch(`/api/videos/${v._id}`).set(owner.auth).send({ visibility: 'friends' });
    expect(res.status).toBe(200);
    expect(await Video.findById(v._id).lean()).toMatchObject({ visibility: 'friends', isPrivate: true });
    expect((await request(app).patch(`/api/videos/${v._id}`).set(owner.auth).send({ visibility: 'x' })).status).toBe(400);

    res = await request(app).patch(`/api/videos/${v._id}`).set(owner.auth).send({ title: 'Đăng nè', isDraft: false, visibility: 'public' });
    expect(res.status).toBe(200);
    await new Promise((r) => setTimeout(r, 50)); // thông báo + lồng tiếng chạy nền
    expect(await Notification.countDocuments({ userId: tagged.user._id, type: 'mention' })).toBe(1);
    expect(await AudioTrack.countDocuments({ videoId: v._id, targetLang: 'en' })).toBe(1);
    expect(dubbingQueue.add).toHaveBeenCalled();
  });

  test('publishDueVideos: tới giờ đăng thì báo người được tag đúng 1 lần', async () => {
    const tagged = await createUser();
    const v = await createVideo(owner.user, {
      scheduledAt: new Date(Date.now() + 1000), mentions: [{ userId: tagged.user._id, username: tagged.user.username }],
    });
    expect(await videoService.publishDueVideos(new Date())).toBe(0);
    const later = new Date(Date.now() + 5000);
    await Video.updateOne({ _id: v._id }, { scheduledAt: new Date(Date.now() - 1000) });
    expect(await videoService.publishDueVideos(later)).toBe(1);
    expect(await videoService.publishDueVideos(later)).toBe(0);
    expect(await Notification.countDocuments({ userId: tagged.user._id, type: 'mention' })).toBe(1);
  });

  test('lưu / báo cáo video bạn bè: bạn bè được, người lạ 404', async () => {
    const v = await createVideo(owner.user, { visibility: 'friends' });
    expect((await request(app).post(`/api/videos/${v._id}/save`).set(friend.auth)).status).toBe(200);
    expect((await request(app).post(`/api/videos/${v._id}/save`).set(stranger.auth)).status).toBe(404);
    expect((await request(app).post(`/api/videos/${v._id}/report`).set(friend.auth).send({ reason: 'spam' })).status).toBe(201);
    expect((await request(app).post(`/api/videos/${v._id}/report`).set(stranger.auth).send({ reason: 'spam' })).status).toBe(404);
    const saved = await request(app).get('/api/users/me/saved').set(friend.auth);
    expect(saved.body.data.map((x) => x._id)).toEqual([String(v._id)]);
  });

  test('bình luận video bạn bè: bạn bè được, người lạ 404', async () => {
    const v = await createVideo(owner.user, { visibility: 'friends' });
    expect((await request(app).post('/api/comments').set(friend.auth).send({ videoId: v._id, content: 'hay' })).status).toBe(201);
    expect((await request(app).post('/api/comments').set(stranger.auth).send({ videoId: v._id, content: 'hay' })).status).toBe(404);
  });
});

// ─── Hồ sơ ─────────────────────────────────────────────────────────────────

describe('Hồ sơ cho giao diện mới', () => {
  test('sort=popular: nhiều lượt xem trước; mặc định ghim rồi mới nhất', async () => {
    const { user } = await createUser();
    const a = await createVideo(user, { viewCount: 5 });
    const b = await createVideo(user, { viewCount: 50 });
    const c = await createVideo(user, { viewCount: 1, pinnedAt: new Date() });
    const ids = async (q) => (await request(app).get(`/api/users/${user._id}/videos`).query(q)).body.data.map((x) => x._id);
    expect(await ids({ sort: 'popular' })).toEqual([b, a, c].map((x) => String(x._id)));
    expect(await ids({})).toEqual([c, b, a].map((x) => String(x._id)));
  });

  test('getProfile có likeTotal; video trong feed có author.isFollowing', async () => {
    const owner = await createUser();
    const viewer = await createUser();
    await createVideo(owner.user, { likeCount: 7 });
    await createVideo(owner.user, { likeCount: 3 });
    expect((await request(app).get(`/api/users/${owner.user.username}`)).body.data.likeTotal).toBe(10);

    await request(app).post(`/api/users/${owner.user._id}/follow`).set(viewer.auth);
    const feed = await request(app).get('/api/feed/for-you').set(viewer.auth);
    expect(feed.body.data.every((v) => v.userId.isFollowing === true)).toBe(true);
    const one = await request(app).get(`/api/videos/${feed.body.data[0]._id}`).set(viewer.auth);
    expect(one.body.data.userId.isFollowing).toBe(true);
  });

  test('liked / followers / following / reposts nhận userId thay cho username', async () => {
    const owner = await createUser({ privacy: { likedVisibility: 'everyone' } });
    const fan = await createUser();
    await request(app).post(`/api/users/${owner.user._id}/follow`).set(fan.auth);
    const followers = await request(app).get(`/api/users/${owner.user._id}/followers`);
    expect(followers.body.data.map((u) => u.username)).toEqual([fan.user.username]);
    const following = await request(app).get(`/api/users/${fan.user._id}/following`);
    expect(following.body.data.map((u) => u.username)).toEqual([owner.user.username]);
    expect((await request(app).get(`/api/users/${owner.user._id}/liked`)).status).toBe(200);
    expect((await request(app).get(`/api/users/${owner.user._id}/reposts`)).status).toBe(200);
  });
});
