/**
 * Giả lập chuỗi query của Mongoose: Model.find().sort().skip().limit().populate().lean()
 * Ghi lại tham số từng bước để test kiểm tra (VD skip bao nhiêu, limit bao nhiêu).
 */
const queryChain = (result) => {
  const calls = {};
  const chain = {};
  ['sort', 'skip', 'limit', 'populate', 'select'].forEach((m) => {
    chain[m] = jest.fn((arg) => {
      calls[m] = arg;
      return chain;
    });
  });
  chain.lean = jest.fn(() => Promise.resolve(result));
  chain.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);
  chain.calls = calls;
  return chain;
};

module.exports = { queryChain };
