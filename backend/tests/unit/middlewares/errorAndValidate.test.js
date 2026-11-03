jest.mock('../../../src/utils/logger', () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() }));

const Joi = require('joi');
const logger = require('../../../src/utils/logger');
const { errorMiddleware } = require('../../../src/middlewares/error.middleware');
const validate = require('../../../src/middlewares/validate.middleware');
const { mockReq, mockRes } = require('../../helpers/http');

describe('errorMiddleware', () => {
  const ENV = process.env.NODE_ENV;
  afterEach(() => {
    process.env.NODE_ENV = ENV;
  });

  const run = (err) => {
    const res = mockRes();
    errorMiddleware(err, mockReq(), res, jest.fn());
    return res;
  };
  const named = (name, extra = {}) => Object.assign(new Error(`${name} msg`), { name, ...extra });

  test.each([
    ['ValidationError (Mongoose)', named('ValidationError'), 400],
    ['CastError (ObjectId sai)', named('CastError'), 400],
    ['Duplicate key 11000', Object.assign(new Error('dup'), { code: 11000 }), 409],
    ['JsonWebTokenError', named('JsonWebTokenError'), 401],
    ['TokenExpiredError', named('TokenExpiredError'), 401],
    ['MulterError (file quá lớn)', named('MulterError'), 400],
    ['Lỗi có statusCode 404', Object.assign(new Error('Video not found'), { statusCode: 404 }), 404],
    ['Lỗi không có statusCode', new Error('boom'), 500],
  ])('%s → HTTP %i', (_, err, status) => {
    expect(run(err).status).toHaveBeenCalledWith(status);
  });

  test('CastError không lộ chi tiết, trả "Invalid ID format"', () => {
    expect(run(named('CastError')).json).toHaveBeenCalledWith({ success: false, message: 'Invalid ID format' });
  });

  describe('biên log: chỉ log lỗi ≥ 500 hoặc không có statusCode', () => {
    test.each([
      [399, false],
      [404, false],
      [499, false],
      [500, true],
      [503, true],
      [undefined, true],
    ])('statusCode=%p → log=%p', (statusCode, logged) => {
      run(Object.assign(new Error('x'), { statusCode }));
      expect(logger.error).toHaveBeenCalledTimes(logged ? 1 : 0);
    });
  });

  describe('ẩn thông điệp lỗi 5xx khi production', () => {
    test('production + 500 → "Internal Server Error"', () => {
      process.env.NODE_ENV = 'production';
      expect(run(new Error('DB password=abc leaked')).json).toHaveBeenCalledWith({ success: false, message: 'Internal Server Error' });
    });
    test('production + 4xx → vẫn trả thông điệp gốc cho client', () => {
      process.env.NODE_ENV = 'production';
      expect(run(Object.assign(new Error('Video not found'), { statusCode: 404 })).json).toHaveBeenCalledWith({ success: false, message: 'Video not found' });
    });
    test('development + 500 → trả thông điệp gốc để debug', () => {
      process.env.NODE_ENV = 'development';
      expect(run(new Error('boom')).json).toHaveBeenCalledWith({ success: false, message: 'boom' });
    });
    test('lỗi không có message → "Internal Server Error"', () => {
      expect(run(new Error('')).json).toHaveBeenCalledWith({ success: false, message: 'Internal Server Error' });
    });
  });
});

describe('validate middleware', () => {
  const schema = Joi.object({ a: Joi.number().max(10).required(), b: Joi.string().required() });

  test('body hợp lệ → next()', () => {
    const next = jest.fn();
    validate(schema)(mockReq({ body: { a: 1, b: 'x' } }), mockRes(), next);
    expect(next).toHaveBeenCalled();
  });

  test('nhiều lỗi → trả về TẤT CẢ lỗi (abortEarly: false)', () => {
    const res = mockRes();
    validate(schema)(mockReq({ body: { a: 11 } }), res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    const body = res.json.mock.calls[0][0];
    expect(body.errors).toHaveLength(2);
  });

  test('[Phát hiện] body undefined → middleware cho qua, không báo lỗi', () => {
    const res = mockRes();
    validate(schema)(mockReq({ body: undefined }), res, jest.fn());
    // Joi coi undefined là "không có giá trị" → object không required → hợp lệ
    // => middleware cho qua; controller phải tự xử lý body rỗng
    expect(res.status).not.toHaveBeenCalled();
  });
});
