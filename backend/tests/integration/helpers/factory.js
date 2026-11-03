/** Tạo nhanh dữ liệu mẫu trong DB test */
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../../../src/models/User');
const Video = require('../../../src/models/Video');

let seq = 0;

// Băm sẵn 1 lần với cost thấp: User.create() băm cost 12 (~0,3 giây/user) làm test rất chậm
const DEFAULT_PASSWORD = 'User@123456';
const PREHASHED = bcrypt.hashSync(DEFAULT_PASSWORD, 4);

async function createUser(overrides = {}) {
  seq += 1;
  const { password = DEFAULT_PASSWORD, ...rest } = overrides;
  // insertMany bỏ qua hook băm mật khẩu → tự gán bản băm sẵn
  const [user] = await User.insertMany([{
    username: `user${seq}`,
    email: `user${seq}@test.com`,
    password: password === DEFAULT_PASSWORD ? PREHASHED : password && bcrypt.hashSync(password, 4),
    ...rest,
  }]);
  const token = jwt.sign({ sub: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1h' });
  return { user, token, auth: { Authorization: `Bearer ${token}` } };
}

async function createVideo(owner, overrides = {}) {
  seq += 1;
  return Video.create({
    userId: owner._id,
    title: `Video ${seq}`,
    status: 'ready',
    moderationStatus: 'approved',
    durationMs: 10000,
    ...overrides,
  });
}

module.exports = { createUser, createVideo };
