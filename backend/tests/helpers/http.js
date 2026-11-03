/** Giả lập req/res/next của Express cho test middleware & controller */
const mockReq = (overrides = {}) => ({ headers: {}, body: {}, query: {}, params: {}, ...overrides });

const mockRes = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

module.exports = { mockReq, mockRes };
