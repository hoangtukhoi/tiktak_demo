const { registerSchema, loginSchema } = require('../../../src/validators/auth.validator');

const valid = { username: 'alice', email: 'alice@tiktak.com', password: '123456' };
const check = (schema, data) => schema.validate(data, { abortEarly: false }).error;

describe('registerSchema', () => {
  test('dữ liệu hợp lệ', () => {
    expect(check(registerSchema, valid)).toBeUndefined();
  });

  describe('username — biên độ dài [3, 30], chỉ chữ & số', () => {
    test.each([
      ['ab', false], // 2 ký tự: dưới biên
      ['abc', true], // 3: biên dưới
      ['a'.repeat(30), true], // 30: biên trên
      ['a'.repeat(31), false], // 31: vượt biên
      ['alice_dev', false], // alphanum không cho dấu _
      ['alice dev', false],
      ['ălice', false], // chữ có dấu
      ['', false],
    ])('%p → hợp lệ = %p', (username, ok) => {
      expect(!check(registerSchema, { ...valid, username })).toBe(ok);
    });
  });

  describe('password — tối thiểu 6 ký tự', () => {
    test.each([
      ['12345', false],
      ['123456', true],
      ['      ', true], // 6 dấu cách vẫn qua: không có quy tắc độ mạnh
    ])('%p → hợp lệ = %p', (password, ok) => {
      expect(!check(registerSchema, { ...valid, password })).toBe(ok);
    });
  });

  describe('email', () => {
    test.each([
      ['a@b.co', true],
      ['alice@tiktak', false], // thiếu TLD
      ['alice.tiktak.com', false],
      ['@tiktak.com', false],
      ['', false],
    ])('%p → hợp lệ = %p', (email, ok) => {
      expect(!check(registerSchema, { ...valid, email })).toBe(ok);
    });
  });

  test.each(['username', 'email', 'password'])('thiếu trường bắt buộc %s → lỗi', (field) => {
    const data = { ...valid };
    delete data[field];
    expect(check(registerSchema, data)).toBeDefined();
  });

  test('trường lạ (role: admin) bị từ chối — chống leo quyền', () => {
    expect(check(registerSchema, { ...valid, role: 'admin' })).toBeDefined();
  });
});

describe('loginSchema', () => {
  test('hợp lệ với email + password bất kỳ độ dài ≥ 1', () => {
    expect(check(loginSchema, { email: 'a@b.co', password: 'x' })).toBeUndefined();
  });
  test('password rỗng → lỗi', () => {
    expect(check(loginSchema, { email: 'a@b.co', password: '' })).toBeDefined();
  });
});
