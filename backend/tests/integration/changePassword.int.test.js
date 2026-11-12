/**
 * PATCH /api/users/me/change-password — đổi mật khẩu.
 */
const request = require('supertest');
const app = require('../../src/app');
const User = require('../../src/models/User');
const { useTestDb } = require('./helpers/db');

useTestDb();

const register = async (name = 'doipass') => {
  const res = await request(app).post('/api/auth/register').send({ username: name, email: `${name}@test.com`, password: 'matkhau_cu' });
  return res.body.data;
};
const change = (token, body) => request(app).patch('/api/users/me/change-password').set('Authorization', `Bearer ${token}`).send(body);
const login = (email, password) => request(app).post('/api/auth/login').send({ email, password });

describe('PATCH /api/users/me/change-password', () => {
  test('đổi thành công: trả token mới, đăng nhập được bằng mật khẩu mới, mật khẩu cũ hết dùng được', async () => {
    const { accessToken } = await register();
    const res = await change(accessToken, { currentPassword: 'matkhau_cu', newPassword: 'matkhau_moi' });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ accessToken: expect.any(String), refreshToken: expect.any(String) });
    expect((await login('doipass@test.com', 'matkhau_moi')).status).toBe(200);
    expect((await login('doipass@test.com', 'matkhau_cu')).status).toBe(401);
    // Token mới dùng được ngay
    expect((await request(app).get('/api/auth/me').set('Authorization', `Bearer ${res.body.data.accessToken}`)).status).toBe(200);
  });

  test('đăng xuất các thiết bị khác: refresh token cũ bị thu hồi, refresh token mới dùng được', async () => {
    const { accessToken, refreshToken: oldRefresh } = await register();
    const res = await change(accessToken, { currentPassword: 'matkhau_cu', newPassword: 'matkhau_moi' });
    expect((await request(app).post('/api/auth/refresh').send({ refreshToken: oldRefresh })).status).toBe(401);
    expect((await request(app).post('/api/auth/refresh').send({ refreshToken: res.body.data.refreshToken })).status).toBe(200);
  });

  test('sai / thiếu mật khẩu hiện tại → 400, mật khẩu không đổi', async () => {
    const { accessToken } = await register();
    expect((await change(accessToken, { currentPassword: 'sai_roi', newPassword: 'matkhau_moi' })).status).toBe(400);
    expect((await change(accessToken, { newPassword: 'matkhau_moi' })).status).toBe(400);
    expect((await login('doipass@test.com', 'matkhau_cu')).status).toBe(200);
  });

  test('mật khẩu mới quá ngắn / quá dài / không phải chuỗi / trùng mật khẩu cũ → 400', async () => {
    const { accessToken } = await register();
    for (const newPassword of ['12345', 'a'.repeat(129), 123456, undefined, 'matkhau_cu']) {
      // eslint-disable-next-line no-await-in-loop
      expect((await change(accessToken, { currentPassword: 'matkhau_cu', newPassword })).status).toBe(400);
    }
  });

  test('tài khoản Google chưa có mật khẩu: đặt mật khẩu không cần mật khẩu hiện tại', async () => {
    const { accessToken, user } = await register('googler');
    await User.updateOne({ _id: user._id }, { $unset: { password: 1 } });
    expect((await change(accessToken, { newPassword: 'matkhau_moi' })).status).toBe(200);
    expect((await login('googler@test.com', 'matkhau_moi')).status).toBe(200);
  });

  test('chưa đăng nhập → 401', async () => {
    expect((await request(app).patch('/api/users/me/change-password').send({ newPassword: 'matkhau_moi' })).status).toBe(401);
  });
});
