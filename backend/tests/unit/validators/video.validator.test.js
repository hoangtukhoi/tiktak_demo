const { createVideoSchema, updateVideoSchema } = require('../../../src/validators/video.validator');

const check = (schema, data) => schema.validate(data).error;

describe('createVideoSchema', () => {
  describe('title — bắt buộc, tối đa 200 ký tự', () => {
    test.each([
      ['a', true],
      ['a'.repeat(200), true],
      ['a'.repeat(201), false],
      ['', false],
    ])('độ dài %#', (title, ok) => {
      expect(!check(createVideoSchema, { title })).toBe(ok);
    });
    test('thiếu title → lỗi', () => {
      expect(check(createVideoSchema, {})).toBeDefined();
    });
  });

  describe('description — tối đa 2000 ký tự', () => {
    test.each([
      [2000, true],
      [2001, false],
    ])('%i ký tự → hợp lệ = %p', (n, ok) => {
      expect(!check(createVideoSchema, { title: 't', description: 'x'.repeat(n) })).toBe(ok);
    });
  });

  test.each([
    [{ hashtags: [] }, true],
    [{ hashtags: ['food', 'hue'] }, true],
    [{ hashtags: 'food' }, false],
    [{ hashtags: [1] }, false],
    [{ isPrivate: 'true' }, true], // Joi tự ép chuỗi "true" → boolean
    [{ isPrivate: 'yes' }, false],
  ])('trường phụ %p → hợp lệ = %p', (extra, ok) => {
    expect(!check(createVideoSchema, { title: 't', ...extra })).toBe(ok);
  });

  test.each(['status', 'viewCount', 'userId', 'moderationStatus'])(
    'không cho client tự đặt %s',
    (field) => {
      expect(check(createVideoSchema, { title: 't', [field]: 'x' })).toBeDefined();
    }
  );
});

describe('updateVideoSchema', () => {
  test('object rỗng vẫn hợp lệ (không có .min(1))', () => {
    expect(check(updateVideoSchema, {})).toBeUndefined();
  });
  test('title 201 ký tự → lỗi', () => {
    expect(check(updateVideoSchema, { title: 'a'.repeat(201) })).toBeDefined();
  });
});
