/** Định dạng phản hồi thống nhất cho toàn bộ API. */
const success = (res, data, statusCode = 200, message = 'Thành công') =>
  res.status(statusCode).json({ success: true, message, data });

const error = (res, message, statusCode = 400, errors = null) =>
  res.status(statusCode).json({ success: false, message, ...(errors && { errors }) });

const paginated = (res, data, pagination, message = 'Thành công') =>
  res.status(200).json({ success: true, message, data, pagination });

module.exports = { success, error, paginated };
