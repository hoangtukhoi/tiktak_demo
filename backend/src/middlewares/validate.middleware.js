/**
 * Bọc Joi schema thành middleware. source: 'body' | 'query' | 'params'.
 * Giá trị sau khi validate được ghi đè lại để controller dùng dữ liệu đã ép kiểu.
 */
const validate = (schema, source = 'body') => (req, res, next) => {
  const { error, value } = schema.validate(req[source], {
    abortEarly: false,
    stripUnknown: true,
    convert: true,
  });
  if (error) {
    return res.status(400).json({
      success: false,
      message: 'Dữ liệu không hợp lệ',
      errors: error.details.map((d) => d.message),
    });
  }
  req[source] = value;
  next();
};

module.exports = validate;
module.exports.validate = validate;
