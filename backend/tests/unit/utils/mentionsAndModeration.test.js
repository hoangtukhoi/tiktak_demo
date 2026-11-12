jest.mock('../../../src/models/User', () => ({}));
const { extractMentionUsernames, MAX_MENTIONS } = require('../../../src/utils/mentions');
const moderation = require('../../../src/services/commentModeration.service');

describe('extractMentionUsernames', () => {
  test.each([
    ['@alice chào', ['alice']],
    ['chào @alice, @bob_2!', ['alice', 'bob_2']],
    ['(@alice)', ['alice']],
    ['@Alice @alice @ALICE', ['Alice']], // trùng không phân biệt hoa thường
    ['email a@alice.com', []], // @ dính sau chữ → không phải tag
    ['@@alice', []],
    ['@ab', []], // dưới 3 ký tự
    [`@${'a'.repeat(31)}`, []], // quá 30 ký tự
    [`@${'a'.repeat(30)}`, ['a'.repeat(30)]],
    ['@tên_có_dấu', []],
    ['', []],
    [null, []],
  ])('%p → %p', (text, expected) => {
    expect(extractMentionUsernames(text)).toEqual(expected);
  });

  test(`tối đa ${MAX_MENTIONS} người`, () => {
    const text = Array.from({ length: 15 }, (_, i) => `@user${i}`).join(' ');
    expect(extractMentionUsernames(text)).toHaveLength(MAX_MENTIONS);
  });
});

describe('Bộ lọc từ khoá (dự phòng khi AI service không chạy)', () => {
  test.each([
    ['Hay quá', 0],
    ['đ.m thằng này', 0.7],
    ['v c l luôn', 0.7],
    ['VCL', 0.7],
    ['Đ M', 0.7],
    ['mẹ mày', 0.7],
    ['fuck you', 0.7],
    // không bắt nhầm
    ['đeo kính đẹp', 0],
    ['con chó nhà mình dễ thương', 0],
    ['vlog mới nè', 0],
    ['mua lon nước', 0],
  ])('%p → %p', (text, score) => {
    expect(moderation.keywordScore(text).score).toBe(score);
  });
});

describe('decide — điểm → trạng thái', () => {
  afterEach(() => {
    delete process.env.COMMENT_MODERATION_MODE;
    delete process.env.COMMENT_REVIEW_THRESHOLD;
  });

  test('từ khoá không bao giờ tự ẩn hẳn, kể cả chế độ auto', () => {
    process.env.COMMENT_MODERATION_MODE = 'auto';
    expect(moderation.decide({ score: 0.99, source: 'keyword' })).toBe('pending');
  });

  test('ngưỡng chờ duyệt đổi được qua .env', () => {
    process.env.COMMENT_REVIEW_THRESHOLD = '0.8';
    expect(moderation.decide({ score: 0.7, source: 'model' })).toBe('approved');
    expect(moderation.decide({ score: 0.8, source: 'model' })).toBe('pending');
  });

  test('không có điểm → hiện', () => {
    expect(moderation.decide({ score: null, source: 'none' })).toBe('approved');
  });

  test('chế độ lạ / không đặt → auto (đủ 3 mức)', () => {
    process.env.COMMENT_MODERATION_MODE = 'xyz';
    expect(moderation.config().mode).toBe('auto');
    delete process.env.COMMENT_MODERATION_MODE;
    expect(moderation.config().mode).toBe('auto');
  });

  test('3 mức theo điểm của model: thấp → hiện, vừa → chờ admin duyệt, cao → ẩn luôn', () => {
    expect(moderation.decide({ score: 0.2, source: 'model' })).toBe('approved');
    expect(moderation.decide({ score: 0.5, source: 'model' })).toBe('pending');
    expect(moderation.decide({ score: 0.84, source: 'model' })).toBe('pending');
    expect(moderation.decide({ score: 0.85, source: 'model' })).toBe('rejected');
    expect(moderation.decide({ score: 0.99, source: 'model' })).toBe('rejected');
  });

  test('chế độ semi: điểm cao cũng chỉ chờ duyệt, không tự ẩn', () => {
    process.env.COMMENT_MODERATION_MODE = 'semi';
    expect(moderation.decide({ score: 0.99, source: 'model' })).toBe('pending');
  });
});
