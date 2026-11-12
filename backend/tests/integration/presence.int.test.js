/**
 * Trạng thái hoạt động (Quản trị → Người dùng): đang online / hoạt động lần cuối,
 * thay cho nhãn "Hoạt động" cũ (thực chất chỉ là "chưa bị khoá").
 * Kèm kiểm tra người dùng mới đăng ký không có tích xanh.
 */
const request = require('supertest');
const app = require('../../src/app');
const User = require('../../src/models/User');
const presence = require('../../src/services/presence.service');
const { useTestDb } = require('./helpers/db');
const { createUser } = require('./helpers/factory');

useTestDb();

const flush = () => new Promise((r) => setTimeout(r, 50));
const adminUsers = (auth, q = '') => request(app).get(`/api/admin/users${q}`).set(auth);

beforeEach(() => presence._reset());

describe('Trạng thái hoạt động', () => {
  let admin;
  beforeEach(async () => {
    admin = await createUser({ role: 'admin' });
  });

  test('người chưa từng dùng → không online, lastActiveAt null', async () => {
    const u = await createUser();
    const rows = (await adminUsers(admin.auth)).body.data;
    const row = rows.find((r) => r._id === String(u.user._id));
    expect(row.isOnline).toBe(false);
    expect(row.lastActiveAt).toBeNull();
  });

  test('gọi API đã đăng nhập → ghi lastActiveAt, hiện đang online', async () => {
    const u = await createUser();
    await request(app).get('/api/auth/me').set(u.auth);
    await flush();
    expect((await User.findById(u.user._id)).lastActiveAt).toBeInstanceOf(Date);
    const row = (await adminUsers(admin.auth)).body.data.find((r) => r._id === String(u.user._id));
    expect(row.isOnline).toBe(true);
  });

  test('hoạt động lần cuối quá 5 phút → không online', async () => {
    const u = await createUser();
    await User.updateOne({ _id: u.user._id }, { lastActiveAt: new Date(Date.now() - 30 * 60 * 1000) });
    const row = (await adminUsers(admin.auth)).body.data.find((r) => r._id === String(u.user._id));
    expect(row.isOnline).toBe(false);
    expect(row.lastActiveAt).toBeTruthy();
  });

  test('đang mở kết nối realtime → online dù lastActiveAt cũ', async () => {
    const u = await createUser();
    await User.updateOne({ _id: u.user._id }, { lastActiveAt: new Date(Date.now() - 30 * 60 * 1000) });
    presence.socketConnected(u.user._id);
    await flush();
    await User.updateOne({ _id: u.user._id }, { lastActiveAt: new Date(Date.now() - 30 * 60 * 1000) });
    const rows = (await adminUsers(admin.auth, '?status=online')).body.data;
    expect(rows.map((r) => r._id)).toContain(String(u.user._id));
    presence.socketDisconnected(u.user._id);
    await flush();
    expect(presence.connectedIds()).not.toContain(String(u.user._id));
  });

  test('lọc status=online chỉ trả người đang online, kết hợp được với tìm kiếm', async () => {
    const on = await createUser({ username: 'dangonline' });
    const off = await createUser({ username: 'dangoffline' });
    await User.updateOne({ _id: on.user._id }, { lastActiveAt: new Date() });
    await User.updateOne({ _id: off.user._id }, { lastActiveAt: new Date(Date.now() - 60 * 60 * 1000) });
    const ids = (await adminUsers(admin.auth, '?status=online&search=dang')).body.data.map((r) => r._id);
    expect(ids).toEqual([String(on.user._id)]);
  });

  test('người bị khoá không bao giờ hiện online', async () => {
    const u = await createUser();
    await User.updateOne({ _id: u.user._id }, { lastActiveAt: new Date(), bannedAt: new Date() });
    const row = (await adminUsers(admin.auth)).body.data.find((r) => r._id === String(u.user._id));
    expect(row.isOnline).toBe(false);
  });

  test('hồ sơ công khai không lộ lastActiveAt', async () => {
    const u = await createUser();
    await User.updateOne({ _id: u.user._id }, { lastActiveAt: new Date() });
    const res = await request(app).get(`/api/users/${u.user.username}`);
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain('lastActiveAt');
  });
});

describe('Tích xanh', () => {
  test('đăng ký mới → isVerified false', async () => {
    const res = await request(app).post('/api/auth/register').send({ username: 'nguoimoi', email: 'nguoimoi@test.com', password: 'matkhau123' });
    expect(res.status).toBe(201);
    expect((await User.findOne({ username: 'nguoimoi' })).isVerified).toBe(false);
    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${res.body.data.accessToken}`);
    expect(me.body.data.isVerified).toBe(false);
  });
});
