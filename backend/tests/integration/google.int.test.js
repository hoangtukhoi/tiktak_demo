const request = require('supertest');

// Bật Google login với key giả (không gọi Google thật)
process.env.GOOGLE_CLIENT_ID = 'test-client-id.apps.googleusercontent.com';
process.env.GOOGLE_CLIENT_SECRET = 'test-secret';
process.env.GOOGLE_CALLBACK_URL = 'http://localhost:3000/api/auth/google/callback';
process.env.FRONTEND_URL = 'http://localhost:3000';

const app = require('../../src/app');
const User = require('../../src/models/User');
const authService = require('../../src/services/auth.service');
const redis = require('../helpers/fakeRedis');
const { useTestDb } = require('./helpers/db');
const { createUser } = require('./helpers/factory');

useTestDb();

const profile = (over = {}) => ({
  id: 'g-123',
  displayName: 'Vũ Lê Hoàng',
  emails: [{ value: 'Hoang.Vu@Gmail.com', verified: true }],
  photos: [{ value: 'https://lh3.googleusercontent.com/a/x' }],
  ...over,
});

describe('authService.googleAuth — tạo / liên kết tài khoản', () => {
  test('lần đầu → tạo tài khoản: username hợp lệ từ email, email chữ thường, không có mật khẩu, KHÔNG tự gắn tích xanh', async () => {
    const { user, accessToken, refreshToken } = await authService.googleAuth(profile());
    expect(user.username).toBe('hoang_vu');
    expect(user.email).toBe('hoang.vu@gmail.com');
    expect(user.displayName).toBe('Vũ Lê Hoàng');
    expect(user.isVerified).toBe(false);
    expect(accessToken && refreshToken).toBeTruthy();
    const saved = await User.findById(user._id).select('+password +refreshTokens');
    expect(saved.password).toBeUndefined();
    expect(saved.refreshTokens).toContain(refreshToken);
  });

  test('lần 2 → dùng lại đúng tài khoản cũ, không tạo thêm', async () => {
    const a = await authService.googleAuth(profile());
    const b = await authService.googleAuth(profile());
    expect(String(a.user._id)).toBe(String(b.user._id));
    expect(await User.countDocuments()).toBe(1);
  });

  test('username trùng (khác hoa thường) → thêm hậu tố _2', async () => {
    await createUser({ username: 'Hoang_Vu' });
    const { user } = await authService.googleAuth(profile());
    expect(user.username).toBe('hoang_vu_2');
  });

  test.each([
    ['ab@x.com', 'Đỗ Đức Anh', 'do_duc_anh'], // email quá ngắn → dùng tên, bỏ dấu, đ → d
    ['a@x.com', '李', 'user'], // không có ký tự hợp lệ nào → "user"
    ['admin@x.com', 'A', 'admin_1'], // tên hệ thống
    [`${'a'.repeat(40)}@x.com`, 'X', 'a'.repeat(24)], // cắt còn 24 ký tự
    ['nguyen..van--a@x.com', 'X', 'nguyen_van_a'], // gộp ký tự lạ liên tiếp
  ])('email %s, tên %s → username %s', async (email, displayName, expected) => {
    const { user } = await authService.googleAuth(profile({ emails: [{ value: email, verified: true }], displayName }));
    expect(user.username).toBe(expected);
    expect(user.username).toMatch(/^[a-zA-Z0-9_]{3,30}$/);
  });

  test('tên hiển thị dài 40 ký tự → cắt còn 30', async () => {
    const { user } = await authService.googleAuth(profile({ displayName: 'x'.repeat(40) }));
    expect(user.displayName).toHaveLength(30);
  });

  test('email đã có tài khoản thường + Google đã xác minh email → liên kết vào tài khoản đó', async () => {
    const { user: existing } = await createUser({ email: 'hoang.vu@gmail.com' });
    const { user } = await authService.googleAuth(profile());
    expect(String(user._id)).toBe(String(existing._id));
    expect((await User.findById(existing._id)).googleId).toBe('g-123');
  });

  test('email đã có tài khoản nhưng Google CHƯA xác minh email → 409, không liên kết', async () => {
    const { user: existing } = await createUser({ email: 'hoang.vu@gmail.com' });
    await expect(authService.googleAuth(profile({ emails: [{ value: 'hoang.vu@gmail.com', verified: false }] })))
      .rejects.toMatchObject({ statusCode: 409, code: 'email_unverified' });
    expect((await User.findById(existing._id)).googleId).toBeUndefined();
  });

  test('email đã liên kết với 1 tài khoản Google KHÁC → 409', async () => {
    await createUser({ email: 'hoang.vu@gmail.com', googleId: 'g-other' });
    await expect(authService.googleAuth(profile())).rejects.toMatchObject({ statusCode: 409, code: 'email_linked' });
  });

  test('tài khoản bị khoá → 403', async () => {
    await createUser({ email: 'hoang.vu@gmail.com', googleId: 'g-123', bannedAt: new Date() });
    await expect(authService.googleAuth(profile())).rejects.toMatchObject({ statusCode: 403 });
  });

  test.each([
    ['không có email', { emails: [] }],
    ['không có id', { id: undefined }],
  ])('%s → 400', async (_, over) => {
    await expect(authService.googleAuth(profile(over))).rejects.toMatchObject({ statusCode: 400 });
  });

  test('2 lần đăng nhập Google đầu tiên cùng lúc → chỉ 1 tài khoản', async () => {
    await Promise.all([authService.googleAuth(profile()), authService.googleAuth(profile())]);
    expect(await User.countDocuments({ email: 'hoang.vu@gmail.com' })).toBe(1);
  });
});

describe('Luồng HTTP đăng nhập Google', () => {
  test('GET /api/auth/google/status → enabled', async () => {
    expect((await request(app).get('/api/auth/google/status')).body.data).toEqual({ enabled: true });
  });

  test('GET /api/auth/google → chuyển sang Google kèm state, đặt cookie state httpOnly', async () => {
    const res = await request(app).get('/api/auth/google').query({ from: '/watch/abc' });
    expect(res.status).toBe(302);
    const url = new URL(res.headers.location);
    expect(url.hostname).toBe('accounts.google.com');
    expect(url.searchParams.get('scope')).toBe('profile email');
    const cookie = res.headers['set-cookie'][0];
    expect(cookie).toMatch(/g_oauth_state=/);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie.split(';')[0].split('=')[1].split('.')[0]).toBe(url.searchParams.get('state'));
  });

  test.each([
    ['state sai', { state: 'b', code: 'x' }, 'a.Lw', 'state'],
    ['không có cookie state', { state: 'a', code: 'x' }, null, 'state'],
    ['người dùng bấm Huỷ', { error: 'access_denied', state: 'a' }, 'a.Lw', 'cancelled'],
  ])('callback %s → về /auth/callback?error=%s', async (_, query, cookie, error) => {
    const req = request(app).get('/api/auth/google/callback').query(query);
    if (cookie) req.set('Cookie', `g_oauth_state=${cookie}`);
    const res = await req;
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`http://localhost:3000/auth/callback?error=${error}`);
  });

  describe('POST /api/auth/google/exchange — đổi code lấy token', () => {
    const CODE = 'a'.repeat(48);
    const exchange = (code) => request(app).post('/api/auth/google/exchange').send({ code });

    test('code hợp lệ → token; dùng lại lần 2 → 401', async () => {
      const result = await authService.googleAuth(profile());
      await redis.set(`oauth:code:${CODE}`, JSON.stringify(result), 'EX', 60);
      const first = await exchange(CODE);
      expect(first.status).toBe(200);
      expect(first.body.data.accessToken).toBe(result.accessToken);
      expect(first.body.data.user).not.toHaveProperty('password');
      expect((await exchange(CODE)).status).toBe(401);
    });

    test('2 request đổi cùng 1 code cùng lúc → chỉ 1 thành công', async () => {
      await redis.set(`oauth:code:${CODE}`, JSON.stringify({ ok: 1 }), 'EX', 60);
      const r = await Promise.all([exchange(CODE), exchange(CODE)]);
      expect(r.map((x) => x.status).sort()).toEqual([200, 401]);
    });

    test.each([[undefined], [''], ['abc'], ['g'.repeat(48)], ['a'.repeat(47)], [{ $ne: null }]])('code sai định dạng %p → 400', async (code) => {
      expect((await exchange(code)).status).toBe(400);
    });

    test('code hết hạn / không tồn tại → 401', async () => {
      expect((await exchange('b'.repeat(48))).status).toBe(401);
    });
  });
});
