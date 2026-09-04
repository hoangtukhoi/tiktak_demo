const success = (res, data, statusCode = 200, message = 'Success') =>
  res.status(statusCode).json({ success: true, message, data });

const error = (res, message, statusCode = 400, errors = null) =>
  res.status(statusCode).json({ success: false, message, ...(errors && { errors }) });

const paginated = (res, data, pagination) =>
  res.status(200).json({ success: true, data, pagination });

module.exports = { success, error, paginated };