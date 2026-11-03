const escapeRegex = require('../../../src/utils/escapeRegex');

describe('escapeRegex', () => {
  test.each([
    ['', ''],
    ['abc', 'abc'],
    ['tiếng việt có dấu', 'tiếng việt có dấu'],
  ])('giữ nguyên chuỗi không có ký tự đặc biệt: %p', (input, expected) => {
    expect(escapeRegex(input)).toBe(expected);
  });

  test('escape đủ 14 ký tự đặc biệt của RegExp', () => {
    const special = '.*+?^${}()|[]\\';
    const escaped = escapeRegex(special);
    expect(escaped).toBe('\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\');
    // Chuỗi đã escape phải khớp đúng nguyên văn chuỗi gốc
    expect(new RegExp(`^${escaped}$`).test(special)).toBe(true);
  });

  test('không escape dấu gạch ngang và dấu # (hashtag)', () => {
    expect(escapeRegex('#hue-food')).toBe('#hue-food');
  });

  test.each([
    [undefined, ''],
    [null, 'null'],
    [123, '123'],
  ])('đầu vào không phải chuỗi %p được ép về chuỗi', (input, expected) => {
    expect(escapeRegex(input)).toBe(expected);
  });

  test('chuỗi tấn công ReDoS trở thành chuỗi thường, chạy tức thì', () => {
    const evil = '(a+)+$';
    const re = new RegExp(escapeRegex(evil));
    const start = Date.now();
    expect(re.test('a'.repeat(50) + '!')).toBe(false);
    expect(Date.now() - start).toBeLessThan(50);
  });

  test('chuỗi rất dài (10.000 ký tự) vẫn xử lý được', () => {
    const long = '.'.repeat(10000);
    expect(escapeRegex(long)).toHaveLength(20000);
  });
});
