const request = require('supertest');
const app = require('../../src/app');
const User = require('../../src/models/User');
const AuditLog = require('../../src/models/AuditLog');
const { useTestDb } = require('./helpers/db');
const { createUser } = require('./helpers/factory');

useTestDb();

describe('Phân quyền /api/admin', () => {
  test.each([
    ['khách', null, 401],
    ['user thường', 'user', 403],
    ['moderator', 'moderator', 403],
    ['admin', 'admin', 200],
  ])('%s → %i', async (_, role, status) => {
    const headers = role ? (await createUser({ role })).auth : {};
    expect((await request(app).get('/api/admin/users').set(headers)).status).toBe(status);
  });
});

describe('POST /api/admin/users/:id/ban', () => {
  const ban = (auth, id, reason = 'spam') => request(app).post(`/api/admin/users/${id}/ban`).set(auth).send({ reason });

  test('khoá thành công → token cũ của người bị khoá dùng không được, có audit log', async () => {
    const admin = await createUser({ role: 'admin' });
    const victim = await createUser();
    expect((await ban(admin.auth, victim.user._id)).status).toBe(200);
    expect((await request(app).get('/api/auth/me').set(victim.auth)).status).toBe(403);
    expect(await AuditLog.countDocuments({ action: 'ban_user' })).toBe(1);
    const saved = await User.findById(victim.user._id).select('+refreshTokens');
    expect(saved.refreshTokens).toEqual([]);
  });

  test.each([
    ['tự khoá chính mình', (admin) => admin.user._id, 403],
    ['id sai định dạng', () => 'abc', 400],
    ['không tồn tại', () => '0123456789abcdef01234567', 404],
  ])('%s → %i', async (_, target, status) => {
    const admin = await createUser({ role: 'admin' });
    expect((await ban(admin.auth, target(admin))).status).toBe(status);
  });

  test('khoá admin khác → 403', async () => {
    const admin = await createUser({ role: 'admin' });
    const other = await createUser({ role: 'admin' });
    expect((await ban(admin.auth, other.user._id)).status).toBe(403);
  });

  test('khoá 2 lần → lần 2 trả 409', async () => {
    const admin = await createUser({ role: 'admin' });
    const victim = await createUser();
    await ban(admin.auth, victim.user._id);
    expect((await ban(admin.auth, victim.user._id)).status).toBe(409);
  });

  test('mở khoá → đăng nhập lại được', async () => {
    const admin = await createUser({ role: 'admin' });
    const victim = await createUser();
    await ban(admin.auth, victim.user._id);
    await request(app).post(`/api/admin/users/${victim.user._id}/unban`).set(admin.auth);
    const res = await request(app).post('/api/auth/login').send({ email: victim.user.email, password: 'User@123456' });
    expect(res.status).toBe(200);
  });
});

describe('GET /api/admin/users — phân trang', () => {
  beforeEach(async () => {
    // insertMany bỏ qua bước băm mật khẩu (bcrypt) → tạo 105 user nhanh
    await User.insertMany(Array.from({ length: 105 }, (_, i) => ({ username: `usr${i}`, email: `usr${i}@t.com` })));
  });

  test.each([
    [{}, 20],
    [{ limit: '1' }, 1],
    [{ limit: '100' }, 100],
    [{ limit: '101' }, 100],
    [{ limit: '0' }, 20],
    [{ limit: '-3' }, 1],
    [{ page: '0' }, 20], // page < 1 → trang 1
    [{ page: '999' }, 0], // vượt quá → rỗng
  ])('query %p → %i người', async (query, expected) => {
    const admin = await createUser({ role: 'admin' });
    const res = await request(app).get('/api/admin/users').query(query).set(admin.auth);
    expect(res.body.data).toHaveLength(expected);
  });

  test('tìm theo email, ký tự đặc biệt không lỗi, không lộ password', async () => {
    const admin = await createUser({ role: 'admin' });
    const res = await request(app).get('/api/admin/users').query({ search: 'usr10@' }).set(admin.auth);
    expect(res.body.data.map((u) => u.username)).toEqual(["usr10"]);
    expect(res.body.data[0]).not.toHaveProperty('password');
    expect((await request(app).get('/api/admin/users').query({ search: '(*' }).set(admin.auth)).status).toBe(200);
  });
});
