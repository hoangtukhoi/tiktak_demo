// Mock toàn bộ phụ thuộc hạ tầng: không cần MongoDB/Redis thật
jest.mock('../../../src/config/redis', () => ({ get: jest.fn(), set: jest.fn(() => Promise.resolve()) }));
const model = () => ({
  find: jest.fn(), findById: jest.fn(), findOne: jest.fn(), findOneAndUpdate: jest.fn(),
  findByIdAndUpdate: jest.fn(), findByIdAndDelete: jest.fn(), create: jest.fn(),
  exists: jest.fn(), updateOne: jest.fn(), deleteMany: jest.fn(), aggregate: jest.fn(),
  countDocuments: jest.fn().mockResolvedValue(0),
});
jest.mock('../../../src/models/Video', () => model());
jest.mock('../../../src/models/Like', () => model());
jest.mock('../../../src/models/Follow', () => model());
jest.mock('../../../src/models/Report', () => model());
jest.mock('../../../src/models/User', () => model());
jest.mock('../../../src/models/Comment', () => model());
jest.mock('../../../src/models/AudioTrack', () => model());
jest.mock('../../../src/models/ViewEvent', () => model());
jest.mock('../../../src/models/SavedVideo', () => ({ ...model(), findOneAndDelete: jest.fn() }));
jest.mock('../../../src/models/Repost', () => ({ ...model(), findOneAndDelete: jest.fn() }));
jest.mock('../../../src/models/Block', () => ({ ...model(), exists: jest.fn().mockResolvedValue(null) }));
jest.mock('../../../src/models/ShareEvent', () => ({ ...model(), SHARE_METHODS: jest.requireActual('../../../src/models/ShareEvent').SHARE_METHODS }));

const mongoose = require('mongoose');
const Video = require('../../../src/models/Video');
const Like = require('../../../src/models/Like');
const Report = require('../../../src/models/Report');
const ViewEvent = require('../../../src/models/ViewEvent');
const ShareEvent = require('../../../src/models/ShareEvent');
const service = require('../../../src/services/video.service');
const { queryChain } = require('../../helpers/queryChain');

const OWNER = new mongoose.Types.ObjectId().toString();
const VIEWER = new mongoose.Types.ObjectId().toString();
const VID = new mongoose.Types.ObjectId().toString();

/** Promise bị reject với statusCode mong đợi */
const rejectsWith = (promise, statusCode) => expect(promise).rejects.toMatchObject({ statusCode });

/** findOneAndUpdate(...).lean() */
const leanResult = (doc) => ({ lean: jest.fn().mockResolvedValue(doc) });

// ─── Phân trang (cursor = số trang hoặc ObjectId) ───────────────────────────

describe('Phân trang getUserVideos / searchVideos', () => {
  const LIMIT = 12;
  const docs = (n) => Array.from({ length: n }, (_, i) => ({ _id: `v${i}` }));

  const page = async (cursor, n = 0) => {
    const chain = queryChain(docs(n));
    Video.find.mockReturnValue(chain);
    const result = await service.getUserVideos(OWNER, cursor, LIMIT, VIEWER);
    return { result, chain, query: Video.find.mock.calls[0][0] };
  };

  test.each([
    [undefined, 0, '1'],
    [null, 0, '1'],
    ['', 0, '1'],
    ['0', 0, '1'],
    ['1', LIMIT, '2'],
    ['999999', 999999 * LIMIT, '1000000'], // 6 chữ số: biên trên của "số trang"
  ])('cursor=%p → skip=%i, nextCursor=%p', async (cursor, skip, next) => {
    const { result, chain } = await page(cursor, LIMIT + 1);
    expect(chain.calls.skip).toBe(skip);
    expect(result.nextCursor).toBe(next);
  });

  test('luôn lấy limit + 1 bản ghi để biết còn trang sau', async () => {
    const { chain } = await page('0', 0);
    expect(chain.calls.limit).toBe(LIMIT + 1);
  });

  test.each([
    [0, 0, null], // không có video
    [1, 1, null],
    [LIMIT - 1, LIMIT - 1, null],
    [LIMIT, LIMIT, null], // đúng bằng limit → hết trang
    [LIMIT + 1, LIMIT, '1'], // dư 1 → còn trang sau, cắt về limit
  ])('DB trả %i bản ghi → trả %i video, nextCursor=%p', async (n, returned, next) => {
    const { result } = await page('0', n);
    expect(result.videos).toHaveLength(returned);
    expect(result.nextCursor).toBe(next);
  });

  test('cursor là ObjectId hợp lệ → lọc _id < cursor, không skip', async () => {
    const { chain, query } = await page(VID, 0);
    expect(chain.calls.skip).toBe(0);
    expect(String(query._id.$lt)).toBe(VID);
  });

  test.each([
    ['1000000'], // 7 chữ số: vượt biên số trang, cũng không phải ObjectId
    ['-1'],
    ['1.5'],
    ['abc'],
    ['zzzzzzzzzzzzzzzzzzzzzzzz'], // 24 ký tự nhưng không phải hex
    ['abcdefghijkl'], // 12 ký tự bất kỳ (mongoose 8 không còn coi là ObjectId)
    [`${VID}x`], // ObjectId thừa 1 ký tự
    [VID.slice(0, -1)], // ObjectId thiếu 1 ký tự
  ])('cursor không hợp lệ %p → lỗi 400', async (cursor) => {
    Video.find.mockReturnValue(queryChain([]));
    await rejectsWith(service.getUserVideos(OWNER, cursor, LIMIT, VIEWER), 400);
  });

  describe('quyền xem video riêng tư', () => {
    test('người khác xem → chỉ video công khai', async () => {
      const { query } = await page('0');
      expect(query).toMatchObject({ userId: OWNER, status: 'ready', isPrivate: false });
    });
    test('chủ kênh xem → thấy cả video riêng tư', async () => {
      Video.find.mockReturnValue(queryChain([]));
      await service.getUserVideos(OWNER, '0', LIMIT, OWNER);
      expect(Video.find.mock.calls[0][0]).not.toHaveProperty('isPrivate');
    });
    test('khách chưa đăng nhập (undefined) → không phải chủ', async () => {
      Video.find.mockReturnValue(queryChain([]));
      await service.getUserVideos(OWNER, '0', LIMIT, undefined);
      expect(Video.find.mock.calls[0][0].isPrivate).toBe(false);
    });
  });

  describe('searchVideos', () => {
    test.each([[undefined], [''], ['   '], ['\n\t']])('từ khoá rỗng %p → 400', async (q) => {
      await rejectsWith(service.searchVideos(q), 400);
    });
    test('trim từ khoá, chỉ tìm video công khai đã sẵn sàng', async () => {
      Video.find.mockReturnValue(queryChain([]));
      await service.searchVideos('  bún bò  ');
      expect(Video.find.mock.calls[0][0]).toMatchObject({
        $text: { $search: 'bún bò' },
        status: 'ready',
        isPrivate: false,
      });
    });
  });
});

// ─── Quyền xem chi tiết video ───────────────────────────────────────────────

describe('getVideoById — ma trận quyền xem', () => {
  // Thông tin đăng lại: không theo dõi ai, không ai đăng lại
  beforeEach(() => {
    require('../../../src/models/Follow').find.mockReturnValue(queryChain([]));
    require('../../../src/models/Repost').find.mockReturnValue(queryChain([]));
    require('../../../src/models/User').find.mockReturnValue(queryChain([]));
    require('../../../src/models/Block').exists.mockResolvedValue(null);
  });
  const mockVideo = (over) => {
    const v = { _id: VID, userId: { _id: OWNER }, status: 'ready', isPrivate: false, moderationStatus: 'approved', ...over };
    Video.findById.mockReturnValue(queryChain(v));
    return v;
  };

  test('không tồn tại → 404', async () => {
    Video.findById.mockReturnValue(queryChain(null));
    await rejectsWith(service.getVideoById(VID), 404);
  });

  const cases = [
    // [mô tả, thuộc tính video, người xem, role, xem được?]
    ['công khai – khách', {}, undefined, undefined, true],
    ['riêng tư – khách', { isPrivate: true }, undefined, undefined, false],
    ['riêng tư – người khác', { isPrivate: true }, VIEWER, 'user', false],
    ['riêng tư – chủ video', { isPrivate: true }, OWNER, 'user', true],
    ['riêng tư – admin', { isPrivate: true }, VIEWER, 'admin', true],
    ['riêng tư – moderator', { isPrivate: true }, VIEWER, 'moderator', true],
    ['đang xử lý – người khác', { status: 'processing' }, VIEWER, 'user', false],
    ['lỗi xử lý – chủ video', { status: 'failed' }, OWNER, 'user', true],
    ['đã xoá – người khác', { status: 'deleted' }, VIEWER, 'user', false],
    ['bị gỡ – người khác', { moderationStatus: 'removed' }, VIEWER, 'user', false],
    ['bị gỡ – admin', { moderationStatus: 'removed' }, VIEWER, 'admin', true],
    ['bị gắn cờ (flagged) – người khác vẫn xem', { moderationStatus: 'flagged' }, VIEWER, 'user', true],
    ['userId chưa populate (ObjectId) – chủ', { userId: OWNER, isPrivate: true }, OWNER, 'user', true],
  ];
  test.each(cases)('%s → xem được = %p', async (_, over, viewer, role, allowed) => {
    mockVideo(over);
    Like.exists.mockResolvedValue(null);
    const p = service.getVideoById(VID, viewer, role);
    if (allowed) await expect(p).resolves.toBeDefined();
    else await rejectsWith(p, 404);
  });

  test('khách → isLiked=false, không truy vấn Like', async () => {
    mockVideo();
    const v = await service.getVideoById(VID);
    expect(v.isLiked).toBe(false);
    expect(Like.exists).not.toHaveBeenCalled();
  });

  test.each([[{ _id: 'l1' }, true], [null, false]])('đã đăng nhập, Like.exists=%p → isLiked=%p', async (found, liked) => {
    mockVideo();
    Like.exists.mockResolvedValue(found);
    expect((await service.getVideoById(VID, VIEWER, 'user')).isLiked).toBe(liked);
  });
});

// ─── Ghi lượt xem ───────────────────────────────────────────────────────────

describe('recordView — chuẩn hoá số liệu xem', () => {
  const DURATION = 10000; // video 10 giây
  beforeEach(() => {
    // Video công khai → qua bước kiểm tra "người này có xem được video không"
    Video.findById.mockReturnValue(queryChain({ _id: VID, userId: OWNER, status: 'ready' }));
  });

  test('video riêng tư của người khác → 404, không tăng lượt xem', async () => {
    Video.findById.mockReturnValue(queryChain({ _id: VID, userId: OWNER, status: 'ready', isPrivate: true, visibility: 'private' }));
    await rejectsWith(service.recordView(VID, { viewerId: VIEWER }), 404);
    expect(Video.findOneAndUpdate).not.toHaveBeenCalled();
  });
  const view = async (opts, videoDur = DURATION) => {
    Video.findOneAndUpdate.mockReturnValue(leanResult({ _id: VID, userId: OWNER, durationMs: videoDur }));
    ViewEvent.create.mockResolvedValue({});
    await service.recordView(VID, { viewerId: VIEWER, ...opts });
    return ViewEvent.create.mock.calls[0]?.[0];
  };

  test('video không tồn tại / chưa sẵn sàng → 404', async () => {
    Video.findOneAndUpdate.mockReturnValue(leanResult(null));
    await rejectsWith(service.recordView(VID, {}), 404);
  });

  test('chủ video tự xem → tăng viewCount nhưng KHÔNG ghi ViewEvent', async () => {
    Video.findOneAndUpdate.mockReturnValue(leanResult({ _id: VID, userId: OWNER, durationMs: DURATION }));
    await service.recordView(VID, { viewerId: OWNER, watchTimeMs: 5000 });
    expect(Video.findOneAndUpdate).toHaveBeenCalled();
    expect(ViewEvent.create).not.toHaveBeenCalled();
  });

  describe('watchTimeMs bị kẹp trong [0, 1 giờ]', () => {
    test.each([
      [-1, 0],
      [0, 0],
      [1, 1],
      [3600000, 3600000], // đúng 1 giờ: biên trên
      [3600001, 3600000], // vượt 1 ms → kẹp
      [Number.MAX_SAFE_INTEGER, 3600000],
      ['5000', 5000], // chuỗi số
      ['abc', 0],
      [NaN, 0],
      [null, 0],
      [Infinity, 3600000],
    ])('%p → %p', async (input, expected) => {
      const ev = await view({ watchTimeMs: input }, 0);
      expect(ev.watchTimeMs).toBe(expected);
    });
  });

  describe('watchedRatio = watch / duration, tối đa 1', () => {
    test.each([
      [0, 0],
      [5000, 0.5],
      [10000, 1],
      [25000, 1], // xem lặp lại 2,5 lần → vẫn 1
    ])('xem %i ms / 10 giây → ratio %p', async (watch, ratio) => {
      expect((await view({ watchTimeMs: watch })).watchedRatio).toBe(ratio);
    });

    test('video chưa có durationMs → dùng durationMs client gửi', async () => {
      const ev = await view({ watchTimeMs: 2000, durationMs: 4000 }, 0);
      expect(ev.videoDurationMs).toBe(4000);
      expect(ev.watchedRatio).toBe(0.5);
    });

    test('cả hai duration đều 0 → ratio 0 (tránh chia cho 0)', async () => {
      const ev = await view({ watchTimeMs: 2000, durationMs: 0 }, 0);
      expect(ev.watchedRatio).toBe(0);
    });

    test('duration client âm → coi như 0', async () => {
      const ev = await view({ watchTimeMs: 2000, durationMs: -5000 }, 0);
      expect(ev.videoDurationMs).toBe(0);
    });

    test('duration của server được ưu tiên hơn client (chống gian lận)', async () => {
      const ev = await view({ watchTimeMs: 5000, durationMs: 5000 });
      expect(ev.videoDurationMs).toBe(DURATION);
      expect(ev.watchedRatio).toBe(0.5);
    });
  });

  describe('completed — biên 90%', () => {
    test.each([
      [8999, false],
      [9000, true], // đúng 90%
      [9001, true],
    ])('xem %i/10000 ms → completed=%p', async (watch, done) => {
      expect((await view({ watchTimeMs: watch })).completed).toBe(done);
    });

    test('[Phát hiện] client gửi completed=true với 0 ms vẫn được tính là xem hết', async () => {
      expect((await view({ watchTimeMs: 0, completed: true })).completed).toBe(true);
    });
  });

  describe('source', () => {
    test.each(['for_you', 'following', 'profile', 'search', 'direct', 'other'])('nguồn hợp lệ %s giữ nguyên', async (source) => {
      expect((await view({ source })).source).toBe(source);
    });
    test.each([['FOR_YOU'], ['hack'], [''], [undefined]])('nguồn lạ %p → "other"', async (source) => {
      expect((await view({ source })).source).toBe('other');
    });
  });

  test('khách (viewerId null) → ghi viewerId null', async () => {
    Video.findOneAndUpdate.mockReturnValue(leanResult({ _id: VID, userId: OWNER, durationMs: DURATION }));
    await service.recordView(VID, { watchTimeMs: 1000 });
    expect(ViewEvent.create.mock.calls[0][0].viewerId).toBeNull();
  });
});

// ─── Chia sẻ ────────────────────────────────────────────────────────────────

describe('recordShare', () => {
  const share = async (opts) => {
    // Video công khai, đã xử lý xong → ai cũng chia sẻ được
    Video.findById.mockReturnValue(queryChain({ _id: VID, userId: OWNER, status: 'ready', shareCount: 7 }));
    Video.findOneAndUpdate.mockReturnValue(leanResult({ _id: VID, userId: OWNER, shareCount: 7 }));
    return service.recordShare(VID, opts);
  };

  test('trả về shareCount mới', async () => {
    await expect(share({ userId: VIEWER, method: 'native' })).resolves.toEqual({ shareCount: 7, counted: true });
  });

  test('tài khoản đã chia sẻ trước đó (khoá Redis đã có) → không tăng bộ đếm, không ghi ShareEvent', async () => {
    const redis = require('../../../src/config/redis');
    redis.set.mockResolvedValueOnce(null);
    await expect(share({ userId: VIEWER })).resolves.toEqual({ shareCount: 7, counted: false });
    expect(Video.findOneAndUpdate).not.toHaveBeenCalled();
    expect(ShareEvent.create).not.toHaveBeenCalled();
  });

  test.each([
    ['native', 'native'],
    ['copy_link', 'copy_link'],
    ['facebook', 'facebook'],
    ['messenger', 'messenger'],
    ['zalo', 'zalo'],
    ['sms', 'other'],
    ['FACEBOOK', 'other'],
    [undefined, 'other'],
  ])('method=%p → lưu %p', async (method, saved) => {
    await share({ userId: VIEWER, method });
    expect(ShareEvent.create.mock.calls[0][0].method).toBe(saved);
  });

  test('chủ video tự chia sẻ → tăng shareCount nhưng không ghi ShareEvent', async () => {
    await share({ userId: OWNER });
    expect(ShareEvent.create).not.toHaveBeenCalled();
  });

  test('khách chia sẻ → ghi ShareEvent với userId null', async () => {
    await share({});
    expect(ShareEvent.create.mock.calls[0][0].userId).toBeNull();
  });

  test('video không sẵn sàng → 404', async () => {
    Video.findById.mockReturnValue(queryChain({ _id: VID, userId: OWNER, status: "processing" }));
    await rejectsWith(service.recordShare(VID, {}), 404);
  });
});

// ─── Báo cáo vi phạm: ngưỡng 3 lượt ─────────────────────────────────────────

describe('reportVideo — tự gắn cờ khi đủ 3 báo cáo', () => {
  beforeEach(() => {
    Video.findById.mockResolvedValue({ _id: VID, userId: OWNER, status: 'ready', isPrivate: false, moderationStatus: 'approved' });
    Report.create.mockResolvedValue({ _id: 'r1' });
  });

  test.each([
    [1, false],
    [2, false], // ngay dưới ngưỡng
    [3, true], // đúng ngưỡng
    [4, true],
  ])('reportCount sau khi tăng = %i → gắn cờ = %p', async (count, flagged) => {
    Video.findByIdAndUpdate.mockResolvedValueOnce({ reportCount: count });
    await service.reportVideo(VID, VIEWER, 'spam');
    const flagCall = Video.findByIdAndUpdate.mock.calls.find(([, update]) => update.moderationStatus === 'flagged');
    expect(Boolean(flagCall)).toBe(flagged);
  });

  test('báo cáo trùng (E11000) → 409', async () => {
    Report.create.mockRejectedValue(Object.assign(new Error('dup'), { code: 11000 }));
    await rejectsWith(service.reportVideo(VID, VIEWER, 'spam'), 409);
  });

  test('lỗi DB khác → ném lại nguyên lỗi', async () => {
    Report.create.mockRejectedValue(new Error('db down'));
    await expect(service.reportVideo(VID, VIEWER, 'spam')).rejects.toThrow('db down');
  });

  test('video không tồn tại → 404, không tạo báo cáo', async () => {
    Video.findById.mockResolvedValue(null);
    await rejectsWith(service.reportVideo(VID, VIEWER, 'spam'), 404);
    expect(Report.create).not.toHaveBeenCalled();
  });
});

// ─── Cập nhật video: whitelist trường ───────────────────────────────────────

describe('updateVideo — chỉ cho sửa trường trong whitelist', () => {
  // Đổi tiêu đề/mô tả → đọc mô tả cũ để tìm người được tag mới (không có ai được tag)
  beforeEach(() => Video.findOne.mockReturnValue(queryChain({ title: 'Cũ', description: '', mentions: [] })));
  test('bỏ qua các trường nhạy cảm (status, viewCount, userId...)', async () => {
    Video.findOneAndUpdate.mockReturnValue({ populate: jest.fn().mockResolvedValue({ _id: VID }) });
    await service.updateVideo(VID, OWNER, {
      title: 'Mới', isPrivate: true, status: 'ready', viewCount: 1e9, userId: VIEWER, moderationStatus: 'approved',
    });
    const [filter, update] = Video.findOneAndUpdate.mock.calls[0];
    expect(filter).toEqual({ _id: VID, userId: OWNER });
    // isPrivate (client cũ) → suy ra visibility
    expect(update).toEqual({ title: 'Mới', isPrivate: true, visibility: 'private', mentions: [] });
  });

  test('giá trị falsy (isPrivate=false, title="") vẫn được cập nhật', async () => {
    Video.findOneAndUpdate.mockReturnValue({ populate: jest.fn().mockResolvedValue({ _id: VID }) });
    await service.updateVideo(VID, OWNER, { isPrivate: false, allowComment: false });
    expect(Video.findOneAndUpdate.mock.calls[0][1]).toEqual({ isPrivate: false, visibility: 'public', allowComment: false });
  });

  test('không phải chủ video → 404', async () => {
    Video.findOneAndUpdate.mockReturnValue({ populate: jest.fn().mockResolvedValue(null) });
    await rejectsWith(service.updateVideo(VID, VIEWER, { title: 'x' }), 404);
  });
});
