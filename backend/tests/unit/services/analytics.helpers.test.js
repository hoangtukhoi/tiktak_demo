jest.mock('../../../src/config/redis', () => ({ get: jest.fn(), set: jest.fn(() => Promise.resolve()) }));
jest.mock('../../../src/jobs/queue', () => ({ transcodeQueue: {}, dubbingQueue: {} }));

const analytics = require('../../../src/services/analytics.service');
const { windowOf, dayKey, startOfLocalDay, pctChange, metric, rate, fill, buildInsights } = analytics._internals;

describe('parseRange — chỉ nhận 7/28/30/60/90/365 ngày', () => {
  test.each([7, 28, 30, 60, 90, 365])('%i → giữ nguyên', (n) => {
    expect(analytics.parseRange(String(n))).toBe(n);
  });

  test.each([
    [undefined, 28],
    ['', 28],
    ['0', 28],
    ['6', 28], // sát dưới 7
    ['8', 28], // sát trên 7
    ['364', 28],
    ['366', 28],
    ['-7', 28],
    ['abc', 28],
    ['1e3', 28],
  ])('%p → fallback %i', (raw, expected) => {
    expect(analytics.parseRange(raw)).toBe(expected);
  });

  test('fallback tuỳ chỉnh', () => {
    expect(analytics.parseRange('5', 30)).toBe(30);
  });

  test.each([
    ['7.9', 7],
    ['28abc', 28],
    [' 60 ', 60],
  ])('[Phát hiện] parseInt dễ dãi: %p được chấp nhận thành %i', (raw, n) => {
    expect(analytics.parseRange(raw, 999)).toBe(n);
  });
});

describe('pctChange — % thay đổi so với kỳ trước', () => {
  test.each([
    [0, 0, 0], // không có gì → 0%
    [5, 0, null], // kỳ trước = 0 → không tính được %, trả null
    [0, 5, -100],
    [10, 10, 0],
    [15, 10, 50],
    [1, 3, -66.7], // làm tròn 1 chữ số thập phân
    [2, 3, -33.3],
    [1000001, 1, 99999999.9 + 0.1], // số rất lớn
  ])('cur=%p, prev=%p → %p', (cur, prev, expected) => {
    if (expected === null) expect(pctChange(cur, prev)).toBeNull();
    else expect(pctChange(cur, prev)).toBeCloseTo(expected, 1);
  });
});

describe('metric', () => {
  test('tính delta và % thay đổi', () => {
    expect(metric(12, 10)).toEqual({ value: 12, previous: 10, delta: 2, change: 20 });
  });
  test('delta làm tròn 1 chữ số (tránh lỗi số thực 0.1+0.2)', () => {
    expect(metric(0.3, 0.1).delta).toBe(0.2);
  });
  test.each([[null, 5], [5, null], [null, null]])('có null (%p, %p) → delta & change = null', (a, b) => {
    const m = metric(a, b);
    expect(m.delta).toBeNull();
    expect(m.change).toBeNull();
  });
  test('value = 0 không bị coi là null', () => {
    expect(metric(0, 4)).toEqual({ value: 0, previous: 4, delta: -4, change: -100 });
  });
});

describe('rate — chỉ tính tỷ lệ khi đủ 30 lượt xem', () => {
  test.each([
    [0, 0, null],
    [5, 29, null], // sát dưới ngưỡng
    [3, 30, 10], // đúng ngưỡng
    [9, 30, 30],
    [1, 3000, 0], // 0.033% → làm tròn 0
    [2, 3000, 0.1],
    [45, 30, 150], // like nhiều hơn view (dữ liệu bất thường) vẫn trả số, không kẹp
  ])('part=%i, views=%i → %p', (part, views, expected) => {
    expect(rate(part, views)).toBe(expected);
  });
});

describe('fill — điền 0 cho ngày không có dữ liệu', () => {
  test('giữ thứ tự keys, ngày thiếu = 0', () => {
    const map = new Map([['2026-11-02', 5]]);
    expect(fill(['2026-11-01', '2026-11-02', '2026-11-03'], map)).toEqual([0, 5, 0]);
  });
  test('keys rỗng → mảng rỗng', () => {
    expect(fill([], new Map([['x', 1]]))).toEqual([]);
  });
});

describe('Múi giờ Việt Nam (UTC+7)', () => {
  test.each([
    ['2026-11-02T16:59:59.999Z', '2026-11-02'], // 23:59:59 giờ VN
    ['2026-11-02T17:00:00.000Z', '2026-11-03'], // 00:00 giờ VN → sang ngày mới
    ['2026-12-31T17:00:00.000Z', '2027-01-01'], // giao thừa
    ['2028-02-28T17:00:00.000Z', '2028-02-29'], // năm nhuận
  ])('dayKey(%s) = %s', (iso, key) => {
    expect(dayKey(new Date(iso))).toBe(key);
  });

  test.each([
    ['2026-11-02T17:00:00.000Z', '2026-11-02T17:00:00.000Z'], // đúng 00:00 VN
    ['2026-11-03T16:59:59.000Z', '2026-11-02T17:00:00.000Z'], // 23:59:59 VN cùng ngày
    ['2026-11-03T00:00:00.000Z', '2026-11-02T17:00:00.000Z'], // 07:00 VN
  ])('startOfLocalDay(%s) = %s', (iso, expected) => {
    expect(startOfLocalDay(new Date(iso)).toISOString()).toBe(expected);
  });
});

describe('windowOf — cửa sổ N ngày tính cả hôm nay', () => {
  afterEach(() => jest.useRealTimers());

  test.each([1, 7, 28, 365])('%i ngày → %i khoá ngày liên tiếp, kết thúc hôm nay', (days) => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-03T05:00:00Z')); // 12:00 VN
    const w = windowOf(days);
    expect(w.keys).toHaveLength(days);
    expect(w.keys[days - 1]).toBe('2026-11-03');
    expect(new Set(w.keys).size).toBe(days); // không trùng ngày
    expect(w.start.getTime() - w.prevStart.getTime()).toBe(days * 86400000); // kỳ trước cùng độ dài
  });

  test('7 ngày: bắt đầu từ 00:00 VN của 6 ngày trước', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-03T05:00:00Z'));
    const w = windowOf(7);
    expect(w.keys[0]).toBe('2026-10-28');
    expect(w.start.toISOString()).toBe('2026-10-27T17:00:00.000Z');
  });

  test('ngay sau nửa đêm VN (00:00:01) đã tính là ngày mới', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-02T17:00:01Z'));
    expect(windowOf(1).keys).toEqual(['2026-11-03']);
  });

  test('ngay trước nửa đêm VN (23:59:59) vẫn là ngày cũ', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-02T16:59:59Z'));
    expect(windowOf(1).keys).toEqual(['2026-11-02']);
  });

  test('365 ngày vượt qua năm nhuận 2028 không bị lặp/thiếu ngày', () => {
    jest.useFakeTimers().setSystemTime(new Date('2028-12-31T05:00:00Z'));
    const keys = windowOf(365).keys;
    expect(keys).toContain('2028-02-29');
    expect(keys[0]).toBe('2028-01-02');
  });
});

describe('buildInsights — nhận xét tự động', () => {
  const base = {
    watch: { views: 100, completionRate: 50 },
    audience: { earlyDropRate: 25, rewatchRate: 0 },
    retention: [],
    sources: [],
    baseline: null,
    first7Days: [],
    durationSec: 60,
    periodViews: 100,
  };
  const texts = (over) => buildInsights({ ...base, ...over });
  const has = (list, type, re) => list.some((i) => i.type === type && re.test(i.text));

  describe('ngưỡng tối thiểu 10 lượt xem', () => {
    test('9 lượt → chỉ 1 nhận xét "cần ít nhất 10 lượt xem"', () => {
      const out = texts({ watch: { views: 9, completionRate: 0 } });
      expect(out).toHaveLength(1);
      expect(out[0].text).toMatch(/ít nhất 10 lượt xem.*hiện có 9/);
    });
    test('10 lượt → bắt đầu phân tích', () => {
      const out = texts({ watch: { views: 10, completionRate: 50 } });
      expect(out[0].text).not.toMatch(/ít nhất 10/);
    });
    test('0 lượt → không lỗi', () => {
      expect(texts({ watch: { views: 0, completionRate: 0 } })).toHaveLength(1);
    });
  });

  test('không có gì nổi bật → 1 nhận xét "bình thường"', () => {
    const out = texts({});
    expect(out).toEqual([{ type: 'info', text: expect.stringMatching(/bình thường/) }]);
  });

  describe('rời đi trong 3 giây đầu: cảnh báo ≥ 40%, khen ≤ 15%', () => {
    test.each([
      [40, 'warn'],
      [39.9, null],
      [15.1, null],
      [15, 'good'],
      [0, 'good'],
    ])('earlyDropRate=%p → %p', (rateVal, type) => {
      const out = texts({ audience: { earlyDropRate: rateVal, rewatchRate: 0 } });
      const hit = out.find((i) => /3 giây đầu/.test(i.text));
      expect(hit?.type ?? null).toBe(type);
    });
  });

  describe('so với trung bình kênh: chênh ±10 điểm %', () => {
    const baseline = (completionRate, avgViewsPerVideo = 0) => ({ enough: true, completionRate, avgViewsPerVideo });
    test.each([
      [60, 50, 'good'], // +10 đúng biên
      [59.9, 50, null],
      [40.1, 50, null],
      [40, 50, 'warn'], // -10 đúng biên
    ])('video %p%% vs kênh %p%% → %p', (cr, base_, type) => {
      const out = texts({ watch: { views: 100, completionRate: cr }, baseline: baseline(base_) });
      const hit = out.find((i) => /Tỷ lệ xem hết/.test(i.text));
      expect(hit?.type ?? null).toBe(type);
    });

    test('baseline.enough=false → bỏ qua so sánh', () => {
      const out = texts({ watch: { views: 100, completionRate: 99 }, baseline: { enough: false, completionRate: 0 } });
      expect(out.some((i) => /Tỷ lệ xem hết/.test(i.text))).toBe(false);
    });

    test.each([
      [150, 'good'], // ×1.5
      [149, null],
      [51, null],
      [50, 'warn'], // ×0.5
    ])('lượt xem kỳ này %i / TB 100 → %p', (views, type) => {
      const out = texts({ periodViews: views, baseline: baseline(50, 100) });
      const hit = out.find((i) => /trung bình các video khác/.test(i.text));
      expect(hit?.type ?? null).toBe(type);
    });

    test('avgViewsPerVideo = 0 → không chia cho 0', () => {
      const out = texts({ periodViews: 100, baseline: baseline(50, 0) });
      expect(out.some((i) => /trung bình các video khác/.test(i.text))).toBe(false);
    });
  });

  test.each([
    [15, true],
    [14.9, false],
  ])('xem lại %p%% → khen = %p', (r, expected) => {
    expect(has(texts({ audience: { earlyDropRate: 25, rewatchRate: r } }), 'good', /xem lại/)).toBe(expected);
  });

  describe('nguồn lượt xem', () => {
    test.each([
      ['for_you', 60, /Dành cho bạn/],
      ['profile', 50, /người đã biết bạn/],
      ['following', 50, /người đã biết bạn/],
      ['search', 30, /tìm kiếm/],
    ])('%s đạt %i%% (đúng biên) → có nhận xét', (s, pct, re) => {
      // nguồn đang xét là nguồn có nhiều lượt xem nhất
      const sources = [{ source: 'other', pct: 10, views: 10 }, { source: s, pct, views: 90 }];
      expect(texts({ sources }).some((i) => re.test(i.text))).toBe(true);
    });
    test.each([
      ['for_you', 59],
      ['search', 29],
    ])('%s chỉ %i%% → không nhận xét', (s, pct) => {
      const sources = [{ source: s, pct, views: 100 }];
      expect(texts({ sources }).find((i) => /Dành cho bạn|tìm kiếm/.test(i.text))).toBeUndefined();
    });
    test('mảng nguồn rỗng hoặc views=0 → không lỗi', () => {
      expect(() => texts({ sources: [] })).not.toThrow();
      expect(() => texts({ sources: [{ source: 'for_you', pct: 100, views: 0 }] })).not.toThrow();
    });
  });

  describe('đoạn mất người xem nhiều nhất (≥ 15 điểm %)', () => {
    const curve = (pcts) => pcts.map((pct, i) => ({ at: i * 10, pct }));
    test('giảm đúng 15 điểm ở đoạn 20–30% → báo, kèm thời gian', () => {
      const out = texts({ retention: curve([100, 90, 85, 70, 65]) });
      const hit = out.find((i) => /Mất nhiều người xem nhất/.test(i.text));
      expect(hit.text).toMatch(/20–30%/);
      expect(hit.text).toMatch(/12 giây – 18 giây/);
    });
    test('giảm 14 điểm → không báo', () => {
      expect(texts({ retention: curve([100, 90, 86, 72]) }).some((i) => /Mất nhiều/.test(i.text))).toBe(false);
    });
    test('bỏ qua đoạn đầu tiên (0–10%) vì đã có chỉ số "3 giây đầu"', () => {
      expect(texts({ retention: curve([100, 50, 48, 46]) }).some((i) => /Mất nhiều/.test(i.text))).toBe(false);
    });
    test('đường cong ≤ 2 điểm hoặc durationSec=0 → bỏ qua', () => {
      expect(texts({ retention: curve([100, 10]) }).some((i) => /Mất nhiều/.test(i.text))).toBe(false);
      expect(texts({ retention: curve([100, 90, 50]), durationSec: 0 }).some((i) => /Mất nhiều/.test(i.text))).toBe(false);
    });
    test('thời gian ≥ 60 giây hiển thị dạng "x phút y giây"', () => {
      const out = texts({ retention: curve([100, 90, 85, 70]), durationSec: 600 });
      expect(out.find((i) => /Mất nhiều/.test(i.text)).text).toMatch(/2 phút 0 giây – 3 phút 0 giây/);
    });
  });

  describe('đà 7 ngày đầu: đỉnh từ ngày thứ 3 trở đi', () => {
    const days = (arr) => arr.map((views, i) => ({ day: i + 1, views }));
    test.each([
      [[1, 2, 10], true], // đỉnh ngày 3 (biên)
      [[1, 10, 2], false], // đỉnh ngày 2
      [[5, 3, 2], false],
    ])('%p → khen = %p', (arr, expected) => {
      expect(texts({ first7Days: days(arr) }).some((i) => /đạt đỉnh/.test(i.text))).toBe(expected);
    });
    test('tổng < 10 lượt → không nhận xét', () => {
      expect(texts({ first7Days: days([1, 2, 6]) }).some((i) => /đạt đỉnh/.test(i.text))).toBe(false);
    });
    test('< 3 ngày dữ liệu → không nhận xét', () => {
      expect(texts({ first7Days: days([1, 20]) }).some((i) => /đạt đỉnh/.test(i.text))).toBe(false);
    });
  });
});
