const request = require('supertest');
const app = require('../../src/app');
const User = require('../../src/models/User');
const Follow = require('../../src/models/Follow');
const ProfileViewEvent = require('../../src/models/ProfileViewEvent');
const { useTestDb } = require('./helpers/db');
const { createUser, createVideo } = require('./helpers/factory');

useTestDb();

const DAY = 86400000;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

describe('GET /api/users/:username — hồ sơ công khai', () => {
  test('người khác xem → không có email; chủ tài khoản xem → có email', async () => {
    const { user, auth } = await createUser();
    const other = await createUser();
    const asOther = await request(app).get(`/api/users/${user.username}`).set(other.auth);
    const asOwner = await request(app).get(`/api/users/${user.username}`).set(auth);
    expect(asOther.body.data).not.toHaveProperty('email');
    expect(asOwner.body.data.email).toBe(user.email);
    expect(asOther.body.data).not.toHaveProperty('password');
    expect(asOther.body.data).not.toHaveProperty('refreshTokens');
  });

  test('tìm được theo cả username lẫn _id', async () => {
    const { user } = await createUser();
    expect((await request(app).get(`/api/users/${user._id}`)).body.data.username).toBe(user.username);
  });

  test('không tồn tại → 404', async () => {
    expect((await request(app).get('/api/users/khong_ton_tai')).status).toBe(404);
  });

  test('totalLikes chỉ cộng video đã sẵn sàng', async () => {
    const { user } = await createUser();
    await createVideo(user, { likeCount: 5 });
    await createVideo(user, { likeCount: 7 });
    await createVideo(user, { likeCount: 100, status: 'processing' });
    expect((await request(app).get(`/api/users/${user.username}`)).body.data.totalLikes).toBe(12);
  });

  describe('đếm lượt xem hồ sơ (tối đa 1 lần / người xem / 30 phút)', () => {
    test('cùng 1 người xem 3 lần → 1 lượt; chủ tự xem → 0 lượt', async () => {
      const { user, auth } = await createUser();
      const viewer = await createUser();
      for (let i = 0; i < 3; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        await request(app).get(`/api/users/${user.username}`).set(viewer.auth);
      }
      await request(app).get(`/api/users/${user.username}`).set(auth);
      await wait(100); // việc ghi lượt xem chạy nền
      expect(await ProfileViewEvent.countDocuments({ profileUserId: user._id })).toBe(1);
    });

    test('2 người xem khác nhau → 2 lượt', async () => {
      const { user } = await createUser();
      const [a, b] = [await createUser(), await createUser()];
      await request(app).get(`/api/users/${user.username}`).set(a.auth);
      await request(app).get(`/api/users/${user.username}`).set(b.auth);
      await wait(100);
      expect(await ProfileViewEvent.countDocuments({ profileUserId: user._id })).toBe(2);
    });
  });
});

describe('PATCH /api/users/me — sửa hồ sơ', () => {
  const patch = (auth, body) => request(app).patch('/api/users/me').set(auth).send(body);

  test('cập nhật tên hiển thị, tiểu sử, link → lưu dạng chuẩn hoá', async () => {
    const { auth } = await createUser();
    const res = await patch(auth, { displayName: '  Hoàng  ', bio: 'xin chào', links: { instagram: '@hoang', website: 'hoang.dev' } });
    expect(res.status).toBe(200);
    expect(res.body.data.displayName).toBe('Hoàng');
    expect(res.body.data.links).toMatchObject({ instagram: 'https://www.instagram.com/hoang', website: 'https://hoang.dev/' });
  });

  test('chỉ sửa 1 link → các link khác giữ nguyên', async () => {
    const { auth, user } = await createUser({ links: { youtube: 'https://youtube.com/@abc' } });
    await patch(auth, { links: { website: 'a.com' } });
    expect((await User.findById(user._id)).links.youtube).toBe('https://youtube.com/@abc');
  });

  test('link sai → 400 và KHÔNG lưu gì (kể cả các trường hợp lệ đi kèm)', async () => {
    const { auth, user } = await createUser();
    const res = await patch(auth, { bio: 'mới', links: { youtube: 'https://vimeo.com/1' } });
    expect(res.status).toBe(400);
    expect((await User.findById(user._id)).bio).toBe('');
  });

  test.each([
    [{}, 400],
    [{ role: 'admin' }, 400],
    [{ email: 'x@y.z' }, 400],
    [{ followerCount: 999 }, 400],
    [{ avatarUrl: 'https://evil.com/a.png' }, 400],
    [{ bio: 'x'.repeat(151) }, 400],
    [{ bio: 'x'.repeat(150) }, 200],
  ])('body %p → %i', async (body, status) => {
    const { auth } = await createUser();
    expect((await patch(auth, body)).status).toBe(status);
  });

  describe('đổi username', () => {
    test('trùng username người khác (khác hoa thường) → 409', async () => {
      await createUser({ username: 'hoang' });
      const { auth } = await createUser();
      expect((await patch(auth, { username: 'HOANG' })).status).toBe(409);
    });

    test('đổi hoa thường username của chính mình → được', async () => {
      const { auth } = await createUser({ username: 'hoang' });
      const res = await patch(auth, { username: 'Hoang' });
      expect(res.status).toBe(200);
      expect(res.body.data.username).toBe('Hoang');
    });

    test('gửi lại đúng username hiện tại → không tính là đổi, không bắt chờ 30 ngày', async () => {
      const { auth, user } = await createUser({ username: 'hoang' });
      await patch(auth, { username: 'hoang' });
      expect((await User.findById(user._id)).usernameChangedAt).toBeNull();
    });

    test.each([
      ['chưa đổi lần nào', null, 200],
      ['đổi cách đây 1 ngày', 1 * DAY, 429],
      ['đổi cách đây 29 ngày 23 giờ', 30 * DAY - 3600000, 429],
      ['đổi cách đây 30 ngày + 1 giây', 30 * DAY + 1000, 200],
      ['đổi cách đây 1 năm', 365 * DAY, 200],
    ])('%s → %i', async (_, ago, status) => {
      const { auth } = await createUser({ usernameChangedAt: ago === null ? null : new Date(Date.now() - ago) });
      expect((await patch(auth, { username: `moi_${Date.now() % 100000}` })).status).toBe(status);
    });

    test('đổi thành công → ghi lại thời điểm đổi', async () => {
      const { auth, user } = await createUser();
      await patch(auth, { username: 'ten_moi' });
      expect((await User.findById(user._id)).usernameChangedAt).toBeInstanceOf(Date);
    });
  });
});

describe('GET /api/users/search', () => {
  test.each([[''], ['   ']])('từ khoá rỗng %p → 400', async (q) => {
    expect((await request(app).get('/api/users/search').query({ q })).status).toBe(400);
  });

  test('ký tự đặc biệt regex được hiểu theo nghĩa đen', async () => {
    await createUser({ username: 'axb' });
    const res = await request(app).get('/api/users/search').query({ q: 'a.b' });
    expect(res.body.data).toHaveLength(0);
  });

  test('không phân biệt hoa thường, tối đa 10 kết quả, không trả email', async () => {
    for (let i = 0; i < 11; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await createUser({ username: `Hoang${i}` });
    }
    const res = await request(app).get('/api/users/search').query({ q: 'hoang' });
    expect(res.body.data).toHaveLength(10);
    expect(res.body.data[0]).not.toHaveProperty('email');
  });

  test('ẩn tài khoản bị khoá', async () => {
    await createUser({ username: 'banned_one', bannedAt: new Date() });
    expect((await request(app).get('/api/users/search').query({ q: 'banned' })).body.data).toHaveLength(0);
  });
});

describe('POST / DELETE /api/users/:id/follow — theo dõi / bỏ theo dõi', () => {
  const follow = (auth, username) => request(app).post(`/api/users/${username}/follow`).set(auth);
  const unfollow = (auth, username) => request(app).delete(`/api/users/${username}/follow`).set(auth);
  const counts = async (a, b) => {
    const [x, y] = await Promise.all([User.findById(a._id), User.findById(b._id)]);
    return { following: x.followingCount, followers: y.followerCount };
  };

  test('theo dõi rồi bỏ theo dõi → bộ đếm 1 rồi về 0', async () => {
    const a = await createUser();
    const b = await createUser();
    expect((await follow(a.auth, b.user.username)).body.data).toEqual({ isFollowing: true, following: true, followerCount: 1 });
    expect(await counts(a.user, b.user)).toEqual({ following: 1, followers: 1 });
    expect((await unfollow(a.auth, b.user.username)).body.data).toEqual({ isFollowing: false, following: false, followerCount: 0 });
    expect(await counts(a.user, b.user)).toEqual({ following: 0, followers: 0 });
  });

  test('POST lần 2 vẫn là "đang theo dõi" (không bật/tắt); DELETE khi chưa theo dõi không làm âm', async () => {
    const a = await createUser();
    const b = await createUser();
    await follow(a.auth, b.user.username);
    expect((await follow(a.auth, b.user.username)).body.data.isFollowing).toBe(true);
    expect(await counts(a.user, b.user)).toEqual({ following: 1, followers: 1 });
    await unfollow(a.auth, b.user.username);
    expect((await unfollow(a.auth, b.user.username)).body.data).toMatchObject({ isFollowing: false, followerCount: 0 });
    expect(await counts(a.user, b.user)).toEqual({ following: 0, followers: 0 });
  });

  test('nhận cả userId (giao diện mới gọi theo _id)', async () => {
    const a = await createUser();
    const b = await createUser();
    expect((await follow(a.auth, b.user._id)).body.data.isFollowing).toBe(true);
    expect((await unfollow(a.auth, b.user._id)).body.data.isFollowing).toBe(false);
  });

  test('tự theo dõi chính mình → 400', async () => {
    const a = await createUser();
    expect((await follow(a.auth, a.user.username)).status).toBe(400);
  });

  test('người không tồn tại → 404', async () => {
    const a = await createUser();
    expect((await follow(a.auth, 'khong_co')).status).toBe(404);
  });

  test('chưa đăng nhập → 401', async () => {
    const b = await createUser();
    expect((await request(app).post(`/api/users/${b.user.username}/follow`)).status).toBe(401);
  });

  // Bấm 2 lần cùng lúc là 2 lần "bật/tắt" → trạng thái cuối khó đoán,
  // nhưng bộ đếm PHẢI luôn khớp với số bản ghi Follow thật và không bao giờ âm.
  const consistent = async (a, b) => {
    const c = await counts(a.user, b.user);
    const real = await Follow.countDocuments({ followerId: a.user._id, followingId: b.user._id });
    expect(real).toBeLessThanOrEqual(1);
    expect(c).toEqual({ following: real, followers: real });
  };

  test('bấm theo dõi 2 lần cùng lúc → bộ đếm khớp số bản ghi Follow (tối đa 1)', async () => {
    const a = await createUser();
    const b = await createUser();
    await Promise.all([follow(a.auth, b.user.username), follow(a.auth, b.user.username)]);
    await consistent(a, b);
  });

  test('bấm bỏ theo dõi 2 lần cùng lúc → bộ đếm về 0, không bị âm', async () => {
    const a = await createUser();
    const b = await createUser();
    await follow(a.auth, b.user.username);
    await Promise.all([unfollow(a.auth, b.user.username), unfollow(a.auth, b.user.username)]);
    await consistent(a, b);
    expect(await counts(a.user, b.user)).toEqual({ following: 0, followers: 0 });
  });

  test('bấm theo dõi / bỏ theo dõi xen kẽ 6 lần cùng lúc → bộ đếm vẫn khớp', async () => {
    const a = await createUser();
    const b = await createUser();
    await Promise.all(Array.from({ length: 6 }, (_, i) => (i % 2 ? unfollow : follow)(a.auth, b.user.username)));
    await consistent(a, b);
  });
});

describe('GET /api/users/:username/videos — giới hạn limit', () => {
  test.each([
    [undefined, 10],
    ['0', 10],
    ['1', 1],
    ['50', 50],
    ['51', 50],
    ['abc', 10],
    ['-1', 1],
  ])('limit=%p → tối đa %i video', async (limit, expected) => {
    const { user } = await createUser();
    await Promise.all(Array.from({ length: 60 }, () => createVideo(user)));
    const res = await request(app).get(`/api/users/${user.username}/videos`).query(limit === undefined ? {} : { limit });
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(expected);
  });

  test('duyệt hết các trang → đủ số video, không trùng', async () => {
    const { user } = await createUser();
    await Promise.all(Array.from({ length: 25 }, () => createVideo(user)));
    const seen = new Set();
    let cursor;
    for (let guard = 0; guard < 10; guard += 1) {
      // eslint-disable-next-line no-await-in-loop
      const res = await request(app).get(`/api/users/${user.username}/videos`).query({ limit: 10, ...(cursor && { cursor }) });
      res.body.data.forEach((v) => seen.add(v._id));
      cursor = res.body.pagination.nextCursor;
      if (!cursor) break;
    }
    expect(seen.size).toBe(25);
  });

  test('người khác không thấy video riêng tư, chủ kênh thấy', async () => {
    const { user, auth } = await createUser();
    const other = await createUser();
    await createVideo(user);
    await createVideo(user, { isPrivate: true });
    const url = `/api/users/${user.username}/videos`;
    expect((await request(app).get(url).set(other.auth)).body.data).toHaveLength(1);
    expect((await request(app).get(url).set(auth)).body.data).toHaveLength(2);
  });
});
