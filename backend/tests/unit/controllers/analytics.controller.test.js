jest.mock('../../../src/services/analytics.service', () => ({
  parseRange: jest.requireActual('../../../src/services/analytics.service').parseRange,
  getAdminAnalytics: jest.fn().mockResolvedValue({ ok: 'admin' }),
  getCreatorOverview: jest.fn().mockResolvedValue({ tab: 'overview' }),
  getCreatorContent: jest.fn().mockResolvedValue({ tab: 'content' }),
  getCreatorViewers: jest.fn().mockResolvedValue({ tab: 'viewers' }),
  getCreatorFollowers: jest.fn().mockResolvedValue({ tab: 'followers' }),
  getCreatorVideoAnalytics: jest.fn().mockResolvedValue({}),
  getAdminVideoAnalytics: jest.fn().mockResolvedValue({}),
  getCreatorCompare: jest.fn().mockResolvedValue({ items: [] }),
}));
jest.mock('../../../src/config/redis', () => ({ get: jest.fn(), set: jest.fn(() => Promise.resolve()) }));
jest.mock('../../../src/jobs/queue', () => ({ transcodeQueue: {}, dubbingQueue: {} }));

const mongoose = require('mongoose');
const analytics = require('../../../src/services/analytics.service');
const ctrl = require('../../../src/controllers/analytics.controller');
const { mockReq, mockRes } = require('../../helpers/http');

const id = () => new mongoose.Types.ObjectId().toString();
const USER = { _id: id() };

describe('compareMyVideos — so sánh 2–3 video', () => {
  const run = async (ids) => {
    const res = mockRes();
    await ctrl.compareMyVideos(mockReq({ user: USER, query: ids === undefined ? {} : { ids } }), res);
    return res;
  };
  const [a, b, c, d] = [id(), id(), id(), id()];

  test.each([
    ['không có ids', undefined, 400],
    ['chuỗi rỗng', '', 400],
    ['1 video', a, 400],
    ['2 video (biên dưới)', `${a},${b}`, 200],
    ['3 video (biên trên)', `${a},${b},${c}`, 200],
    ['4 video', `${a},${b},${c},${d}`, 400],
    ['2 id trùng nhau → còn 1', `${a},${a}`, 400],
    ['3 id, 1 trùng → còn 2', `${a},${b},${a}`, 200],
    ['4 id, 2 trùng → còn 3', `${a},${b},${c},${c}`, 200],
    ['dấu phẩy thừa và khoảng trắng', ` ${a} ,, ${b} ,`, 200],
    ['có id không hợp lệ', `${a},xyz`, 400],
  ])('%s → HTTP %i', async (_, ids, status) => {
    const res = await run(ids);
    expect(res.status).toHaveBeenCalledWith(status);
  });

  test('truyền id đã chuẩn hoá (trim + bỏ trùng) cho service', async () => {
    await run(` ${a} ,${b},${a}`);
    expect(analytics.getCreatorCompare).toHaveBeenCalledWith(USER._id, [a, b]);
  });
});

describe('getMyAnalyticsTab', () => {
  const run = async (tab, range) => {
    const res = mockRes();
    await ctrl.getMyAnalyticsTab(mockReq({ user: USER, params: tab ? { tab } : {}, query: { range } }), res);
    return res;
  };

  test.each([
    [undefined, 'getCreatorOverview'],
    ['overview', 'getCreatorOverview'],
    ['content', 'getCreatorContent'],
    ['viewers', 'getCreatorViewers'],
    ['followers', 'getCreatorFollowers'],
  ])('tab=%p → gọi %s', async (tab, fn) => {
    await run(tab, '7');
    expect(analytics[fn]).toHaveBeenCalledWith(USER._id, 7);
  });

  test.each([['admin'], ['__proto__'], ['constructor'], ['OVERVIEW']])('tab lạ %p → 404', async (tab) => {
    const res = await run(tab);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  test.each([
    [undefined, 7],
    ['365', 365],
    ['366', 7],
  ])('range=%p → %i ngày (mặc định 7)', async (range, days) => {
    await run('overview', range);
    expect(analytics.getCreatorOverview).toHaveBeenCalledWith(USER._id, days);
  });
});

describe('Phân tích từng video — kiểm tra id', () => {
  test.each([
    ['getMyVideoAnalytics'],
    ['getAdminVideoAnalytics'],
  ])('%s: id sai định dạng → 400, không gọi service', async (fn) => {
    const res = mockRes();
    await ctrl[fn](mockReq({ user: USER, params: { id: 'abc' } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('admin: range mặc định 30, creator: mặc định 28', async () => {
    const vid = id();
    await ctrl.getAdminVideoAnalytics(mockReq({ user: USER, params: { id: vid } }), mockRes());
    await ctrl.getMyVideoAnalytics(mockReq({ user: USER, params: { id: vid } }), mockRes());
    expect(analytics.getAdminVideoAnalytics).toHaveBeenCalledWith(vid, 30);
    expect(analytics.getCreatorVideoAnalytics).toHaveBeenCalledWith(USER._id, vid, 28);
  });
});
