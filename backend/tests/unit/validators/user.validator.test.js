const {
  updateProfileSchema,
  normalizeLinks,
  RESERVED_USERNAMES,
} = require('../../../src/validators/user.validator');

const validate = (data) => updateProfileSchema.validate(data, { abortEarly: false });
const ok = (data) => !validate(data).error;

describe('updateProfileSchema', () => {
  describe('object tổng thể', () => {
    test('object rỗng → lỗi "Không có thông tin nào để cập nhật"', () => {
      const { error } = validate({});
      expect(error.details[0].message).toBe('Không có thông tin nào để cập nhật');
    });
    test.each(['email', 'role', 'password', 'followerCount', 'bannedAt'])(
      'không cho sửa trường %s',
      (field) => {
        expect(ok({ [field]: 'x' })).toBe(false);
      }
    );
  });

  describe('username — [3, 30] ký tự, chữ/số/_ , không trùng tên hệ thống', () => {
    test.each([
      ['ab', false],
      ['abc', true],
      ['a'.repeat(30), true],
      ['a'.repeat(31), false],
      ['alice_dev', true],
      ['alice.dev', false],
      ['alice-dev', false],
      ['nguyễn', false],
      ['___', true], // toàn dấu gạch dưới vẫn hợp lệ theo pattern
      ['123', true],
    ])('%p → hợp lệ = %p', (username, expected) => {
      expect(ok({ username })).toBe(expected);
    });

    test('cắt khoảng trắng hai đầu trước khi kiểm tra độ dài', () => {
      const { value, error } = validate({ username: '  abc  ' });
      expect(error).toBeUndefined();
      expect(value.username).toBe('abc');
    });

    test('"  ab  " sau khi trim chỉ còn 2 ký tự → lỗi', () => {
      expect(ok({ username: '  ab  ' })).toBe(false);
    });

    test.each([...RESERVED_USERNAMES].filter((n) => n.length >= 3))('tên hệ thống "%s" bị chặn', (name) => {
      const { error } = validate({ username: name });
      expect(error.details[0].message).toBe('Username này đã được hệ thống giữ chỗ');
    });

    test('"me" (2 ký tự) đã bị chặn từ biên độ dài', () => {
      expect(validate({ username: 'me' }).error.details[0].message).toBe('Username phải có ít nhất 3 ký tự');
    });

    test.each(['ADMIN', 'Admin', 'aDmIn'])('chặn không phân biệt hoa thường: %s', (name) => {
      expect(ok({ username: name })).toBe(false);
    });

    test('"admin1" không nằm trong danh sách giữ chỗ → hợp lệ', () => {
      expect(ok({ username: 'admin1' })).toBe(true);
    });
  });

  describe('displayName — tối đa 30 ký tự, cho phép rỗng', () => {
    test.each([
      ['', true],
      ['Vũ Lê Hoàng', true],
      ['a'.repeat(30), true],
      ['a'.repeat(31), false],
      ['🎬'.repeat(15), true], // 15 emoji = 30 code unit UTF-16
      ['🎬'.repeat(16), false], // 32 code unit → vượt (Joi đếm theo code unit)
    ])('%#: %p → hợp lệ = %p', (displayName, expected) => {
      expect(ok({ displayName })).toBe(expected);
    });

    test('31 ký tự nhưng có khoảng trắng hai đầu → trim còn 29 → hợp lệ', () => {
      expect(ok({ displayName: ` ${'a'.repeat(29)} ` })).toBe(true);
    });
  });

  describe('bio — tối đa 150 ký tự (không trim)', () => {
    test.each([
      [0, true],
      [150, true],
      [151, false],
    ])('%i ký tự → hợp lệ = %p', (n, expected) => {
      expect(ok({ bio: 'x'.repeat(n) })).toBe(expected);
    });
  });

  describe('avatarUrl — chỉ được đặt null (xoá ảnh)', () => {
    test('null → hợp lệ', () => expect(ok({ avatarUrl: null })).toBe(true));
    test('URL bất kỳ → lỗi, phải dùng API tải ảnh', () => {
      const { error } = validate({ avatarUrl: 'https://evil.com/a.png' });
      expect(error.details[0].message).toBe('Đổi ảnh đại diện bằng cách tải ảnh lên');
    });
    test('chuỗi rỗng → lỗi', () => expect(ok({ avatarUrl: '' })).toBe(false));
  });

  describe('links — mỗi link tối đa 200 ký tự, cho phép rỗng/null', () => {
    test.each([
      [{ website: '' }, true],
      [{ website: null }, true],
      [{ website: 'a'.repeat(200) }, true],
      [{ website: 'a'.repeat(201) }, false],
      [{ instagram: 'a'.repeat(201) }, false],
      [{ youtube: 'a'.repeat(201) }, false],
      [{ tiktok: 'abc' }, false], // mạng xã hội không hỗ trợ
      [{}, true],
    ])('%p → hợp lệ = %p', (links, expected) => {
      expect(ok({ links })).toBe(expected);
    });
  });
});

describe('normalizeLinks', () => {
  const expect400 = (links, msg) => {
    try {
      normalizeLinks(links);
      throw new Error('Không ném lỗi');
    } catch (err) {
      expect(err.statusCode).toBe(400);
      if (msg) expect(err.message).toMatch(msg);
    }
  };

  test('không truyền gì → object rỗng (không đụng tới link nào)', () => {
    expect(normalizeLinks()).toEqual({});
    expect(normalizeLinks({})).toEqual({});
  });

  test.each([
    [''], [null], ['   '],
  ])('giá trị rỗng %p → chuỗi rỗng (xoá link)', (v) => {
    expect(normalizeLinks({ website: v, instagram: v, youtube: v })).toEqual({ website: '', instagram: '', youtube: '' });
  });

  describe('website', () => {
    test.each([
      ['example.com', 'https://example.com/'],
      ['http://example.com', 'http://example.com/'],
      ['HTTPS://Example.com/Path', 'https://example.com/Path'],
      ['  example.com/a?b=1  ', 'https://example.com/a?b=1'],
      ['sub.domain.vn', 'https://sub.domain.vn/'],
    ])('%p → %p', (input, expected) => {
      expect(normalizeLinks({ website: input }).website).toBe(expected);
    });

    test.each([
      ['localhost'], // không có dấu chấm
      ['javascript:alert(1)'],
      ['ftp://example.com'],
      ['http://'],
      ['not a url'],
    ])('%p → lỗi 400', (input) => {
      expect400({ website: input }, 'Website');
    });
  });

  describe('instagram', () => {
    test.each([
      ['@a', 'https://www.instagram.com/a'], // handle 1 ký tự: biên dưới
      ['a'.repeat(30), `https://www.instagram.com/${'a'.repeat(30)}`], // 30: biên trên
      ['@vu.le_hoang', 'https://www.instagram.com/vu.le_hoang'],
      ['https://instagram.com/abc', 'https://instagram.com/abc'],
      ['https://www.instagram.com/abc', 'https://www.instagram.com/abc'],
      ['https://m.instagram.com/abc', 'https://m.instagram.com/abc'],
      ['instagram.com/abc', 'https://instagram.com/abc'],
    ])('%p → %p', (input, expected) => {
      expect(normalizeLinks({ instagram: input }).instagram).toBe(expected);
    });

    test.each([
      ['https://evil.com/abc'],
      ['https://instagram.com.evil.com/abc'], // tên miền giả mạo
      ['https://notinstagram.com/abc'],
      ['@' + 'a'.repeat(31) + '/x'],
      ['@abc def'],
    ])('%p → lỗi 400', (input) => {
      expect400({ instagram: input }, 'Instagram');
    });

    test('handle 31 ký tự không còn là handle → coi như URL, sai tên miền → lỗi', () => {
      expect400({ instagram: 'a'.repeat(31) }, 'Instagram');
    });

    test('[Phát hiện] "instagram.com" không có đường dẫn bị hiểu nhầm là handle', () => {
      // Hành vi hiện tại: khớp regex handle (chữ + dấu chấm) → tạo link sai.
      expect(normalizeLinks({ instagram: 'instagram.com' }).instagram).toBe('https://www.instagram.com/instagram.com');
    });
  });

  describe('youtube', () => {
    test.each([
      ['@abc', 'https://www.youtube.com/@abc'], // handle 3 ký tự: biên dưới
      ['@' + 'a'.repeat(30), `https://www.youtube.com/@${'a'.repeat(30)}`], // 30: biên trên
      ['@my-channel.vn', 'https://www.youtube.com/@my-channel.vn'],
      ['https://youtube.com/@abc', 'https://youtube.com/@abc'],
      ['https://youtu.be/xyz', 'https://youtu.be/xyz'],
      ['https://m.youtube.com/watch?v=1', 'https://m.youtube.com/watch?v=1'],
    ])('%p → %p', (input, expected) => {
      expect(normalizeLinks({ youtube: input }).youtube).toBe(expected);
    });

    test.each([
      ['@ab'], // 2 ký tự: dưới biên
      ['@' + 'a'.repeat(31)], // 31: vượt biên
      ['abc'], // thiếu @ và không phải tên miền youtube
      ['https://vimeo.com/1'],
      ['https://youtube.com.evil.com/@abc'],
    ])('%p → lỗi 400', (input) => {
      expect400({ youtube: input }, 'YouTube');
    });
  });

  test('chỉ trả về những link được gửi lên', () => {
    expect(normalizeLinks({ website: 'a.com' })).toEqual({ website: 'https://a.com/' });
  });
});
