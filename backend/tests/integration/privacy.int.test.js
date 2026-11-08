/**
 * Quyền riêng tư (đợt 1): danh sách người theo dõi / đang theo dõi, cài đặt hiển thị,
 * ai được bình luận / tag / đăng lại, ẩn khỏi tìm kiếm, chặn người dùng.
 */
const request = require('supertest');
const app = require('../../src/app');
const User = require('../../src/models/User');
const Follow = require('../../src/models/Follow');
const Block = require('../../src/models/Block');
const Notification = require('../../src/models/Notification');
const { useTestDb } = require('./helpers/db');
const { createUser, createVideo } = require('./helpers/factory');

useTestDb();

const follow = (who, target) => request(app).post(`/api/users/${target.user.username}/follow`).set(who.auth);
const setPrivacy = (who, body) => request(app).patch('/api/users/me/privacy').set(who.auth).send(body);
const get = (who, url) => request(app).get(url).set(who ? who.auth : {});

describe('Cài đặt quyền riêng tư', () => {
  test('GET trả mặc định; PATCH lưu từng mục; giá trị sai → 400', async () => {
    const me = await createUser();
    const def = await get(me, '/api/users/me/privacy');
    expect(def.body.data).toMatchObject({ followersVisibility: 'everyone', likedVisibility: 'only_me', allowRepost: true, discoverable: true });

    const res = await setPrivacy(me, { followersVisibility: 'friends', allowRepost: false });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ followersVisibility: 'friends', allowRepost: false, followingVisibility: 'everyone' });

    expect((await setPrivacy(me, { followersVisibility: 'abc' })).status).toBe(400);
    expect((await setPrivacy(me, { allowRepost: 'yes' })).status).toBe(400);
    expect((await setPrivacy(me, { role: 'admin' })).status).toBe(400);
    expect((await setPrivacy(me, {})).status).toBe(400);
    expect((await request(app).patch('/api/users/me/privacy').send({ discoverable: false })).status).toBe(401);
  });

  test('hồ sơ chỉ trả cài đặt cho chính chủ; người khác nhận access', async () => {
    const owner = await createUser();
    const other = await createUser();
    const mine = await get(owner, `/api/users/${owner.user.username}`);
    expect(mine.body.data.privacy).toBeDefined();
    const theirs = await get(other, `/api/users/${owner.user.username}`);
    expect(theirs.body.data.privacy).toBeUndefined();
    expect(theirs.body.data.access).toEqual({ followers: true, following: true, liked: false, reposts: true });
  });
});

describe('Danh sách người theo dõi / đang theo dõi', () => {
  let owner;
  let a;
  let b;
  beforeEach(async () => {
    owner = await createUser({ username: 'chu_tk' });
    a = await createUser({ username: 'anh_dao' });
    b = await createUser({ username: 'binh_minh' });
    await follow(a, owner);
    await follow(b, owner);
    await follow(owner, a); // owner và a là bạn bè
  });

  test('xem được, mới nhất trước, kèm isFollowing / followsYou theo người xem', async () => {
    const res = await get(a, `/api/users/${owner.user.username}/followers`);
    expect(res.status).toBe(200);
    expect(res.body.data.map((u) => u.username)).toEqual(['binh_minh', 'anh_dao']);
    expect(res.body.data.find((u) => u.username === 'anh_dao').isMe).toBe(true);
    const following = await get(b, `/api/users/${owner.user.username}/following`);
    expect(following.body.data).toHaveLength(1);
    expect(following.body.data[0]).toMatchObject({ username: 'anh_dao', isFollowing: false });
  });

  test('tìm theo tên trong danh sách', async () => {
    const res = await get(null, `/api/users/${owner.user.username}/followers?q=binh`);
    expect(res.body.data.map((u) => u.username)).toEqual(['binh_minh']);
  });

  test('phân trang: limit=1 → có nextCursor', async () => {
    const p1 = await get(null, `/api/users/${owner.user.username}/followers?limit=1`);
    expect(p1.body.data).toHaveLength(1);
    const p2 = await get(null, `/api/users/${owner.user.username}/followers?limit=1&cursor=${p1.body.pagination.nextCursor}`);
    expect(p2.body.data[0].username).not.toBe(p1.body.data[0].username);
    expect((await get(null, `/api/users/${owner.user.username}/followers?cursor=x`)).status).toBe(400);
  });

  test.each([
    ['everyone', [true, true, true, true]],
    ['friends', [false, true, false, true]], // khách, bạn bè, người theo dõi 1 chiều, chủ
    ['only_me', [false, false, false, true]],
  ])('followersVisibility=%s → [khách, bạn bè, theo dõi 1 chiều, chủ] xem được = %p', async (level, expected) => {
    await setPrivacy(owner, { followersVisibility: level });
    const url = `/api/users/${owner.user.username}/followers`;
    const statuses = await Promise.all([get(null, url), get(a, url), get(b, url), get(owner, url)].map((p) => p.then((r) => r.status)));
    expect(statuses.map((s) => s === 200)).toEqual(expected);
    const denied = (await get(null, url)).body;
    if (!expected[0]) expect(denied.code).toBe('PRIVATE');
  });

  test('admin luôn xem được', async () => {
    await setPrivacy(owner, { followingVisibility: 'only_me' });
    const admin = await createUser({ role: 'admin' });
    expect((await get(admin, `/api/users/${owner.user.username}/following`)).status).toBe(200);
  });

  test('xoá người theo dõi → bộ đếm 2 phía giảm, họ không được báo', async () => {
    const res = await request(app).delete(`/api/users/me/followers/${b.user._id}`).set(owner.auth);
    expect(res.status).toBe(200);
    expect((await User.findById(owner.user._id)).followerCount).toBe(1);
    expect((await User.findById(b.user._id)).followingCount).toBe(0);
    expect((await request(app).delete(`/api/users/me/followers/${b.user._id}`).set(owner.auth)).status).toBe(404);
    expect((await request(app).delete('/api/users/me/followers/abc').set(owner.auth)).status).toBe(400);
  });
});

describe('Tab Đã tim / Đăng lại theo cài đặt', () => {
  test('Đã tim mặc định chỉ mình tôi; bật "mọi người" thì người khác xem được', async () => {
    const owner = await createUser();
    const other = await createUser();
    const creator = await createUser();
    const v = await createVideo(creator.user);
    await request(app).post(`/api/videos/${v._id}/like`).set(owner.auth);
    const url = `/api/users/${owner.user.username}/liked`;
    expect((await get(other, url)).status).toBe(403);
    expect((await get(owner, url)).body.data).toHaveLength(1);
    await setPrivacy(owner, { likedVisibility: 'everyone' });
    const res = await get(other, url);
    expect(res.status).toBe(200);
    expect(res.body.data[0].isLiked).toBe(false); // cờ theo người xem, không phải chủ tab
  });

  test('Đăng lại chỉ mình tôi → người khác 403', async () => {
    const owner = await createUser();
    await setPrivacy(owner, { repostsVisibility: 'only_me' });
    expect((await get(null, `/api/users/${owner.user.username}/reposts`)).status).toBe(403);
    expect((await get(owner, `/api/users/${owner.user.username}/reposts`)).status).toBe(200);
  });
});

describe('Ai được bình luận / tag / đăng lại', () => {
  let owner;
  let fan;
  let stranger;
  let video;
  beforeEach(async () => {
    owner = await createUser({ username: 'tac_gia' });
    fan = await createUser();
    stranger = await createUser();
    video = await createVideo(owner.user);
    await follow(fan, owner);
  });
  const comment = (who, content = 'hay') => request(app).post('/api/comments').set(who.auth).send({ videoId: video._id, content });

  test.each([
    ['everyone', [201, 201, 201]],
    ['followers', [403, 201, 201]], // người lạ, người theo dõi, chủ
    ['friends', [403, 403, 201]],
    ['no_one', [403, 403, 201]],
  ])('commentPermission=%s → [người lạ, người theo dõi, chủ] = %p', async (level, expected) => {
    await setPrivacy(owner, { commentPermission: level });
    expect([(await comment(stranger)).status, (await comment(fan)).status, (await comment(owner)).status]).toEqual(expected);
  });

  test('chi tiết video trả commentPolicy kèm lý do', async () => {
    await setPrivacy(owner, { commentPermission: 'followers' });
    const res = await get(stranger, `/api/videos/${video._id}`);
    expect(res.body.data.commentPolicy).toEqual({ allowed: false, reason: expect.stringContaining('người theo dõi') });
    expect((await get(fan, `/api/videos/${video._id}`)).body.data.commentPolicy).toEqual({ allowed: true });
  });

  test('mentionPermission: no_one → không ai tag được; following → chỉ người tác giả theo dõi tag được', async () => {
    await setPrivacy(owner, { mentionPermission: 'no_one' });
    const other = await createVideo(stranger.user);
    let res = await request(app).post('/api/comments').set(fan.auth).send({ videoId: other._id, content: '@tac_gia xem nè' });
    expect(res.body.data.mentions).toEqual([]);

    await setPrivacy(owner, { mentionPermission: 'following' });
    res = await request(app).post('/api/comments').set(fan.auth).send({ videoId: other._id, content: '@tac_gia xem nè' });
    expect(res.body.data.mentions).toEqual([]); // owner chưa theo dõi fan
    await follow(owner, fan);
    res = await request(app).post('/api/comments').set(fan.auth).send({ videoId: other._id, content: '@tac_gia xem nè' });
    expect(res.body.data.mentions.map((m) => m.username)).toEqual(['tac_gia']);
  });

  test('allowRepost=false → không đăng lại được (403), video báo canRepost=false; bỏ đăng lại cũ vẫn được', async () => {
    await request(app).post(`/api/videos/${video._id}/repost`).set(fan.auth);
    await setPrivacy(owner, { allowRepost: false });
    expect((await request(app).post(`/api/videos/${video._id}/repost`).set(stranger.auth)).status).toBe(403);
    expect((await get(stranger, `/api/videos/${video._id}`)).body.data.canRepost).toBe(false);
    const undo = await request(app).post(`/api/videos/${video._id}/repost`).set(fan.auth);
    expect(undo.body.data.reposted).toBe(false);
  });

  test('discoverable=false → không hiện trong tìm kiếm / gợi ý tag (trừ khi gõ đúng tên)', async () => {
    await setPrivacy(owner, { discoverable: false });
    expect((await get(fan, '/api/users/search?q=tac')).body.data).toEqual([]);
    expect((await get(fan, '/api/users/search?q=tac_gia')).body.data).toHaveLength(1);
    expect((await get(fan, '/api/users/mention-suggest?q=tac')).body.data).toEqual([]);
  });
});

describe('Chặn người dùng', () => {
  let me;
  let bad;
  let myVideo;
  let badVideo;
  beforeEach(async () => {
    me = await createUser({ username: 'toi_day' });
    bad = await createUser({ username: 'ke_xau' });
    myVideo = await createVideo(me.user);
    badVideo = await createVideo(bad.user);
    await follow(me, bad);
    await follow(bad, me);
  });
  const block = () => request(app).post(`/api/users/${bad.user.username}/block`).set(me.auth);

  test('chặn → bỏ theo dõi 2 chiều, bộ đếm đúng, có trong danh sách đã chặn', async () => {
    expect((await block()).status).toBe(200);
    expect(await Follow.countDocuments()).toBe(0);
    expect(await User.findById(me.user._id)).toMatchObject({ followerCount: 0, followingCount: 0 });
    expect(await User.findById(bad.user._id)).toMatchObject({ followerCount: 0, followingCount: 0 });
    const list = await get(me, '/api/users/me/blocked');
    expect(list.body.data.map((u) => u.username)).toEqual(['ke_xau']);
    expect((await block()).status).toBe(200); // chặn lại lần nữa không lỗi
    expect(await Block.countDocuments()).toBe(1);
  });

  test('sau khi chặn: người bị chặn không xem được hồ sơ, video, không bình luận / theo dõi / đăng lại / tag', async () => {
    await block();
    expect((await get(bad, `/api/users/${me.user.username}`)).status).toBe(404);
    expect((await get(bad, `/api/videos/${myVideo._id}`)).status).toBe(404);
    expect((await get(bad, `/api/users/${me.user.username}/videos`)).body.data).toEqual([]);
    expect((await request(app).post('/api/comments').set(bad.auth).send({ videoId: myVideo._id, content: 'x' })).status).toBe(403);
    expect((await follow(bad, me)).status).toBe(403);
    expect((await request(app).post(`/api/videos/${myVideo._id}/repost`).set(bad.auth)).status).toBe(404);
    const other = await createUser();
    const ov = await createVideo(other.user);
    const c = await request(app).post('/api/comments').set(bad.auth).send({ videoId: ov._id, content: '@toi_day ê' });
    expect(c.body.data.mentions).toEqual([]);
    expect(await Notification.countDocuments({ userId: me.user._id, type: 'mention' })).toBe(0);
  });

  test('người chặn: thấy hồ sơ với isBlocked=true, video của họ biến mất khỏi feed / tìm kiếm / bình luận', async () => {
    const other = await createUser();
    const ov = await createVideo(other.user);
    await request(app).post('/api/comments').set(bad.auth).send({ videoId: ov._id, content: 'bình luận của kẻ xấu' });
    await block();
    const profile = await get(me, `/api/users/${bad.user.username}`);
    expect(profile.body.data.isBlocked).toBe(true);
    const feed = await get(me, '/api/feed/for-you');
    expect(feed.body.data.map((v) => v._id)).not.toContain(String(badVideo._id));
    expect((await get(me, `/api/comments/video/${ov._id}`)).body.data).toEqual([]);
    expect((await get(me, '/api/users/search?q=ke_xau')).body.data).toEqual([]);
  });

  test('bỏ chặn → mọi thứ trở lại (nhưng không tự theo dõi lại)', async () => {
    await block();
    expect((await request(app).delete(`/api/users/${bad.user.username}/block`).set(me.auth)).status).toBe(200);
    expect((await get(bad, `/api/users/${me.user.username}`)).status).toBe(200);
    expect(await Follow.countDocuments()).toBe(0);
  });

  test('không tự chặn mình; người dùng không tồn tại → 404', async () => {
    expect((await request(app).post(`/api/users/${me.user.username}/block`).set(me.auth)).status).toBe(400);
    expect((await request(app).post('/api/users/khong_co/block').set(me.auth)).status).toBe(404);
  });
});
