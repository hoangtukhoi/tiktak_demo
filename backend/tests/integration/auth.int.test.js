const request = require('supertest');
const app = require('../../src/app');
const User = require('../../src/models/User');
const { useTestDb } = require('./helpers/db');
const { createUser } = require('./helpers/factory');

useTestDb();

const register = (body) => request(app).post('/api/auth/register').send(body);
const login = (email, password = 'User@123456') => request(app).post('/api/auth/login').send({ email, password });
const refresh = (refreshToken) => request(app).post('/api/auth/refresh').send({ refreshToken });

describe('POST /api/auth/register', () => {
  const body = { username: 'alice', email: 'alice@tiktak.com', password: '123456' };

  test('đăng ký thành công → 201, có token, KHÔNG lộ password/refreshTokens', async () => {
    const res = await register(body);
    expect(res.status).toBe(201);
    expect(res.body.data.accessToken).toEqual(expect.any(String));
    expect(res.body.data.refreshToken).toEqual(expect.any(String));
    expect(res.body.data.user).not.toHaveProperty('password');
    expect(res.body.data.user).not.toHaveProperty('refreshTokens');
    const saved = await User.findOne({ email: body.email }).select('+password');
    expect(saved.password).not.toBe('123456'); // đã băm
  });

  test('email lưu dạng chữ thường', async () => {
    await register({ ...body, email: 'Alice@TikTak.com' });
    expect(await User.exists({ email: 'alice@tiktak.com' })).toBeTruthy();
  });

  test('trùng email → 409 "Email đã được sử dụng"', async () => {
    await register(body);
    const res = await register({ ...body, username: 'alice2' });
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('Email đã được sử dụng');
  });

  test('trùng email khác hoa thường → 409 với đúng thông báo email', async () => {
    await register(body);
    const res = await register({ ...body, username: 'alice2', email: 'ALICE@tiktak.com' });
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('Email đã được sử dụng');
  });

  test('trùng username → 409', async () => {
    await register(body);
    const res = await register({ ...body, email: 'other@tiktak.com' });
    expect(res.status).toBe(409);
  });

  test('trùng username khác hoa thường ("ALICE" vs "alice") → 409', async () => {
    await register(body);
    const res = await register({ ...body, username: 'ALICE', email: 'other@tiktak.com' });
    expect(res.status).toBe(409);
  });

  test.each([
    ['username 2 ký tự', { username: 'ab' }],
    ['password 5 ký tự', { password: '12345' }],
    ['email sai', { email: 'abc' }],
    ['tự đặt role admin', { role: 'admin' }],
  ])('%s → 400', async (_, over) => {
    expect((await register({ ...body, ...over })).status).toBe(400);
  });

  test('2 request đăng ký cùng lúc cùng email → chỉ 1 tài khoản được tạo', async () => {
    const results = await Promise.all([register(body), register({ ...body, username: 'aliceb' })]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await User.countDocuments({ email: body.email })).toBe(1);
  });
});

describe('POST /api/auth/login', () => {
  test('đúng thông tin → 200 và cập nhật lastLoginAt', async () => {
    const { user } = await createUser();
    const res = await login(user.email);
    expect(res.status).toBe(200);
    expect((await User.findById(user._id)).lastLoginAt).toBeInstanceOf(Date);
  });

  test('sai mật khẩu và email không tồn tại → cùng 1 thông báo (không lộ email nào đã đăng ký)', async () => {
    const { user } = await createUser();
    const wrongPass = await login(user.email, 'sai_mat_khau');
    const noUser = await login('khongco@test.com');
    expect(wrongPass.status).toBe(401);
    expect(noUser.status).toBe(401);
    expect(wrongPass.body.message).toBe(noUser.body.message);
  });

  test('tài khoản bị khoá → 403', async () => {
    const { user } = await createUser({ bannedAt: new Date() });
    expect((await login(user.email)).status).toBe(403);
  });

  test('tài khoản Google (không có mật khẩu) đăng nhập bằng mật khẩu → 401, không lỗi 500', async () => {
    const { user } = await createUser({ password: undefined, googleId: 'g1' });
    expect((await login(user.email, 'bat_ky')).status).toBe(401);
  });
});

describe('Refresh token & phiên đăng nhập', () => {
  test('2 lần đăng nhập trong cùng 1 giây → 2 refresh token KHÁC nhau', async () => {
    const { user } = await createUser();
    const [a, b] = await Promise.all([login(user.email), login(user.email)]);
    expect(a.body.data.refreshToken).not.toBe(b.body.data.refreshToken);
  });

  test('refresh xoay vòng: token cũ dùng lại → 401', async () => {
    const { user } = await createUser();
    const { refreshToken } = (await login(user.email)).body.data;
    const first = await refresh(refreshToken);
    expect(first.status).toBe(200);
    expect((await refresh(refreshToken)).status).toBe(401);
    expect((await refresh(first.body.data.refreshToken)).status).toBe(200);
  });

  test.each([
    ['không gửi token', undefined],
    ['token rác', 'abc'],
  ])('%s → 401', async (_, token) => {
    expect((await refresh(token)).status).toBe(401);
  });

  test('access token không dùng được làm refresh token (khác secret)', async () => {
    const { user } = await createUser();
    const { accessToken } = (await login(user.email)).body.data;
    expect((await refresh(accessToken)).status).toBe(401);
  });

  test('giới hạn 10 phiên: đăng nhập lần thứ 11 → phiên thứ 1 bị đẩy ra, phiên thứ 2 còn dùng được', async () => {
    const { user } = await createUser();
    const tokens = [];
    for (let i = 0; i < 11; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      tokens.push((await login(user.email)).body.data.refreshToken);
    }
    const saved = await User.findById(user._id).select('+refreshTokens');
    expect(saved.refreshTokens).toHaveLength(10);
    expect(saved.refreshTokens).not.toContain(tokens[0]);
    expect(saved.refreshTokens).toContain(tokens[1]);
  });

  test('2 request refresh cùng lúc bằng 1 token → chỉ 1 thành công (chống dùng lại token)', async () => {
    const { user } = await createUser();
    const { refreshToken } = (await login(user.email)).body.data;
    const results = await Promise.all([refresh(refreshToken), refresh(refreshToken)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 401]);
  });

  test('đăng xuất → refresh token đó không dùng được nữa', async () => {
    const { user } = await createUser();
    const { accessToken, refreshToken } = (await login(user.email)).body.data;
    const out = await request(app).post('/api/auth/logout').set('Authorization', `Bearer ${accessToken}`).send({ refreshToken });
    expect(out.status).toBe(200);
    expect((await refresh(refreshToken)).status).toBe(401);
  });

  test('bị khoá sau khi đăng nhập → refresh bị từ chối', async () => {
    const { user } = await createUser();
    const { refreshToken } = (await login(user.email)).body.data;
    await User.updateOne({ _id: user._id }, { bannedAt: new Date() });
    expect((await refresh(refreshToken)).status).toBe(403);
  });
});

describe('GET /api/auth/me', () => {
  test('token hợp lệ → thông tin user, không có password', async () => {
    const { auth, user } = await createUser();
    const res = await request(app).get('/api/auth/me').set(auth);
    expect(res.status).toBe(200);
    expect(res.body.data.username).toBe(user.username);
    expect(res.body.data).not.toHaveProperty('password');
  });

  test('user đã bị xoá nhưng token còn hạn → 401', async () => {
    const { auth, user } = await createUser();
    await User.deleteOne({ _id: user._id });
    expect((await request(app).get('/api/auth/me').set(auth)).status).toBe(401);
  });
});
