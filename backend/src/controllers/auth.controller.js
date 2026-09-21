const authService = require('../services/auth.service');
const { env } = require('../config/env');
const { success } = require('../utils/apiResponse');

exports.register = async (req, res) => {
  const { username, email, password } = req.body;
  success(res, await authService.register(username, email, password), 201, 'Đăng ký thành công');
};

exports.login = async (req, res) => {
  const { email, password } = req.body;
  success(res, await authService.login(email, password), 200, 'Đăng nhập thành công');
};

exports.refresh = async (req, res) => {
  success(res, await authService.refreshToken(req.body.refreshToken));
};

exports.logout = async (req, res) => {
  await authService.logout(req.user._id, req.body?.refreshToken);
  success(res, null, 200, 'Đăng xuất thành công');
};

exports.me = async (req, res) => {
  success(res, req.user);
};

/**
 * Sau khi Google xác thực xong, chuyển hướng kèm token về frontend.
 * Frontend đọc query rồi lưu token vào storage.
 */
exports.googleCallback = async (req, res) => {
  const { accessToken, refreshToken } = req.user;
  const url = new URL('/auth/callback', env.FRONTEND_URL);
  url.searchParams.set('accessToken', accessToken);
  url.searchParams.set('refreshToken', refreshToken);
  res.redirect(url.toString());
};
