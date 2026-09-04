const authService = require('../services/auth.service');
const { success } = require('../utils/apiResponse');

exports.register = async (req, res) => {
  const { username, email, password } = req.body;
  const result = await authService.register(username, email, password);
  success(res, result, 201, 'Đăng ký thành công');
};
exports.login = async (req, res) => {
  const { email, password } = req.body;
  const result = await authService.login(email, password);
  success(res, result, 200, 'Đăng nhập thành công');
};
exports.refresh = async (req, res) => {
  const { refreshToken } = req.body;
  const tokens = await authService.refreshToken(refreshToken);
  success(res, tokens);
};
exports.logout = async (req, res) => {
  const { refreshToken } = req.body;
  await authService.logout(req.user._id, refreshToken);
  success(res, null, 200, 'Đăng xuất thành công');
};
exports.me = async (req, res) => {
  success(res, req.user);
};
exports.googleCallback = async (req, res) => {
  const tokens = req.user.tokens;
  res.redirect(`${process.env.FRONTEND_URL}/auth/callback?accessToken=${tokens.accessToken}&refreshToken=${tokens.refreshToken}`);
};