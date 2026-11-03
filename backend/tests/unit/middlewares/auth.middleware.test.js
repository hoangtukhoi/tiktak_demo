jest.mock('../../../src/models/User', () => ({ findById: jest.fn() }));

const jwt = require('jsonwebtoken');
const User = require('../../../src/models/User');
const {
  authenticate,
  optionalAuth,
  requireRole,
  requireInternalKey,
} = require('../../../src/middlewares/auth.middleware');
const { mockReq, mockRes } = require('../../helpers/http');

const sign = (payload = { sub: 'u1' }, opts = {}) => jwt.sign(payload, process.env.JWT_SECRET, opts);
const bearer = (token) => ({ authorization: `Bearer ${token}` });

describe('authenticate', () => {
  const run = async (headers) => {
    const req = mockReq({ headers });
    const res = mockRes();
    const next = jest.fn();
    await authenticate(req, res, next);
    return { req, res, next };
  };

  test('token hợp lệ, user tồn tại → gắn req.user và next()', async () => {
    const user = { _id: 'u1', role: 'user' };
    User.findById.mockResolvedValue(user);
    const { req, next, res } = await run(bearer(sign()));
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toBe(user);
    expect(res.status).not.toHaveBeenCalled();
    expect(User.findById).toHaveBeenCalledWith('u1');
  });

  test.each([
    ['không có header', {}],
    ['header rỗng', { authorization: '' }],
    ['chỉ có "Bearer"', { authorization: 'Bearer' }],
    ['"Bearer " + chuỗi rỗng', { authorization: 'Bearer ' }],
    ['sai scheme Basic', { authorization: 'Basic abc' }],
    ['thừa dấu cách giữa scheme và token', { authorization: `Bearer  ${sign()}` }],
  ])('%s → 401 Unauthorized, không gọi DB', async (_, headers) => {
    const { res, next } = await run(headers);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
    expect(User.findById).not.toHaveBeenCalled();
  });

  test('scheme viết thường "bearer" vẫn được chấp nhận', async () => {
    User.findById.mockResolvedValue({ _id: 'u1' });
    const { next } = await run({ authorization: `bearer ${sign()}` });
    expect(next).toHaveBeenCalled();
  });

  test.each([
    ['token hết hạn', () => sign({ sub: 'u1' }, { expiresIn: -1 })],
    ['ký bằng secret khác', () => jwt.sign({ sub: 'u1' }, 'other_secret')],
    ['token rác', () => 'not.a.jwt'],
    ['thuật toán none', () => jwt.sign({ sub: 'u1' }, null, { algorithm: 'none' })],
  ])('%s → 401 Invalid token', async (_, makeToken) => {
    const { res, next } = await run(bearer(makeToken()));
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Invalid token' }));
    expect(next).not.toHaveBeenCalled();
  });

  test('token đúng nhưng user đã bị xoá → 401 User not found', async () => {
    User.findById.mockResolvedValue(null);
    const { res } = await run(bearer(sign()));
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'User not found' }));
  });

  test('user bị khoá (bannedAt) → 403 dù token còn hạn', async () => {
    User.findById.mockResolvedValue({ _id: 'u1', bannedAt: new Date() });
    const { res, next } = await run(bearer(sign()));
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  test('lỗi DB khi tìm user → 401 (không làm sập request)', async () => {
    User.findById.mockRejectedValue(new Error('db down'));
    const { res } = await run(bearer(sign()));
    expect(res.status).toHaveBeenCalledWith(401);
  });
});

describe('optionalAuth', () => {
  const run = async (headers) => {
    const req = mockReq({ headers });
    const next = jest.fn();
    await optionalAuth(req, mockRes(), next);
    return { req, next };
  };

  test('không có token → khách, vẫn next()', async () => {
    const { req, next } = await run({});
    expect(req.user).toBeUndefined();
    expect(next).toHaveBeenCalledTimes(1);
  });

  test('token sai → coi như khách, vẫn next() đúng 1 lần', async () => {
    const { req, next } = await run(bearer('garbage'));
    expect(req.user).toBeUndefined();
    expect(next).toHaveBeenCalledTimes(1);
  });

  test('token hợp lệ → gắn req.user', async () => {
    User.findById.mockResolvedValue({ _id: 'u1' });
    const { req } = await run(bearer(sign()));
    expect(req.user).toEqual({ _id: 'u1' });
  });

  test('user bị khoá → không gắn req.user', async () => {
    User.findById.mockResolvedValue({ _id: 'u1', bannedAt: new Date() });
    const { req, next } = await run(bearer(sign()));
    expect(req.user).toBeUndefined();
    expect(next).toHaveBeenCalledTimes(1);
  });
});

describe('requireRole', () => {
  const run = (user, ...roles) => {
    const res = mockRes();
    const next = jest.fn();
    requireRole(...roles)(mockReq({ user }), res, next);
    return { res, next };
  };

  test.each([
    [{ role: 'admin' }, ['admin'], true],
    [{ role: 'moderator' }, ['admin', 'moderator'], true],
    [{ role: 'user' }, ['admin'], false],
    [{ role: 'Admin' }, ['admin'], false], // phân biệt hoa thường
    [{}, ['admin'], false],
    [undefined, ['admin'], false], // chưa đăng nhập
    [{ role: 'admin' }, [], false], // không khai báo role nào → chặn hết
  ])('user=%p, roles=%p → cho qua = %p', (user, roles, allowed) => {
    const { res, next } = run(user, ...roles);
    if (allowed) {
      expect(next).toHaveBeenCalled();
    } else {
      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    }
  });
});

describe('requireInternalKey', () => {
  const KEY = process.env.INTERNAL_KEY;
  const run = (headers) => {
    const res = mockRes();
    const next = jest.fn();
    requireInternalKey(mockReq({ headers }), res, next);
    return { res, next };
  };
  afterEach(() => {
    process.env.INTERNAL_KEY = KEY;
  });

  test('key đúng → next()', () => {
    expect(run({ 'x-internal-key': KEY }).next).toHaveBeenCalled();
  });

  test.each([
    ['thiếu header', {}],
    ['chuỗi rỗng', { 'x-internal-key': '' }],
    ['thiếu 1 ký tự cuối', { 'x-internal-key': KEY.slice(0, -1) }],
    ['thừa 1 ký tự', { 'x-internal-key': `${KEY}x` }],
    ['cùng độ dài, khác 1 ký tự', { 'x-internal-key': `${KEY.slice(0, -1)}X` }],
    ['khác hoa thường', { 'x-internal-key': KEY.toUpperCase() }],
    ['header dạng mảng', { 'x-internal-key': [KEY] }],
    ['có khoảng trắng thừa', { 'x-internal-key': ` ${KEY}` }],
  ])('%s → 401', (_, headers) => {
    const { res, next } = run(headers);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('server chưa cấu hình INTERNAL_KEY → luôn 401 (kể cả header rỗng)', () => {
    delete process.env.INTERNAL_KEY;
    expect(run({ 'x-internal-key': '' }).res.status).toHaveBeenCalledWith(401);
    expect(run({ 'x-internal-key': 'undefined' }).res.status).toHaveBeenCalledWith(401);
  });

  test('key chứa ký tự Unicode: so sánh theo byte, không lỗi', () => {
    process.env.INTERNAL_KEY = 'khóa_bí_mật';
    expect(run({ 'x-internal-key': 'khóa_bí_mật' }).next).toHaveBeenCalled();
    expect(run({ 'x-internal-key': 'khoa_bi_mat' }).res.status).toHaveBeenCalledWith(401);
  });
});
