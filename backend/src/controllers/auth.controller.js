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
  const refreshToken = req.body?.refreshToken || req.body?.refresh_token || req.headers.authorization?.replace(/^Bearer\s+/i, '');
  const tokens = await authService.refreshToken(refreshToken);
  success(res, tokens);
};
exports.logout = async (req, res) => {
  const refreshToken = req.body?.refreshToken || req.body?.refresh_token || req.headers.authorization?.replace(/^Bearer\s+/i, '');
  await authService.logout(req.user._id, refreshToken);
  success(res, null, 200, 'Đăng xuất thành công');
};
exports.me = async (req, res) => {
  success(res, req.user);
};
// ── Đăng nhập Google ────────────────────────────────────────────────────────
// Luồng: /auth/google → Google → /auth/google/callback → frontend /auth/callback?code=...
// → frontend gọi POST /auth/google/exchange để đổi code (dùng 1 lần, sống 60 giây) lấy token.
// Không đưa token thẳng lên URL vì URL bị lưu trong lịch sử trình duyệt / log server.

const crypto = require('crypto');
const passport = require('passport');
const redis = require('../config/redis');
const { googleEnabled } = require('../config/passport');

const STATE_COOKIE = 'g_oauth_state';
const CODE_TTL = 60;
const frontendUrl = () => (process.env.FRONTEND_URL || 'http://localhost:3000').split(',')[0].trim().replace(/\/$/, '');
const readCookie = (req, name) =>
  (req.headers.cookie || '').split(';').map((c) => c.trim().split('=')).find(([k]) => k === name)?.[1];
/** Chỉ cho quay về đường dẫn nội bộ (chống open redirect) */
const safePath = (p) => (typeof p === 'string' && /^\/(?!\/)[^\s]*$/.test(p) ? p : '/');
const toFrontend = (res, params) => res.redirect(`${frontendUrl()}/auth/callback?${new URLSearchParams(params)}`);

exports.googleStart = (req, res, next) => {
  if (!googleEnabled) return toFrontend(res, { error: 'google_disabled' });
  // state ngẫu nhiên lưu trong cookie httpOnly → chống giả mạo callback (login CSRF)
  const state = crypto.randomBytes(16).toString('hex');
  const from = safePath(req.query.from);
  res.cookie(STATE_COOKIE, `${state}.${Buffer.from(from).toString('base64url')}`, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 10 * 60 * 1000,
    path: '/api/auth/google',
  });
  return passport.authenticate('google', { scope: ['profile', 'email'], session: false, state, prompt: 'select_account' })(req, res, next);
};

exports.googleCallback = (req, res, next) => {
  if (!googleEnabled) return toFrontend(res, { error: 'google_disabled' });
  const [savedState, fromB64 = ''] = String(readCookie(req, STATE_COOKIE) || '').split('.');
  res.clearCookie(STATE_COOKIE, { path: '/api/auth/google' });
  if (req.query.error) return toFrontend(res, { error: 'cancelled' }); // người dùng bấm Huỷ ở Google
  if (!savedState || savedState !== req.query.state) return toFrontend(res, { error: 'state' });
  const from = safePath(Buffer.from(fromB64, 'base64url').toString());

  return passport.authenticate('google', { session: false }, async (err, result) => {
    if (err || !result) return toFrontend(res, { error: err?.code || 'google_failed' });
    const code = crypto.randomBytes(24).toString('hex');
    try {
      await redis.set(`oauth:code:${code}`, JSON.stringify(result), 'EX', CODE_TTL);
    } catch {
      return toFrontend(res, { error: 'server' });
    }
    return toFrontend(res, { code, from });
  })(req, res, next);
};

exports.googleExchange = async (req, res) => {
  const code = req.body?.code;
  if (typeof code !== 'string' || !/^[a-f0-9]{48}$/.test(code)) {
    return res.status(400).json({ success: false, message: 'Mã đăng nhập không hợp lệ' });
  }
  // GETDEL: lấy và xoá trong 1 lệnh → mỗi code chỉ đổi được đúng 1 lần
  const raw = await redis.getdel(`oauth:code:${code}`);
  if (!raw) return res.status(401).json({ success: false, message: 'Mã đăng nhập đã hết hạn, hãy thử lại' });
  return success(res, JSON.parse(raw), 200, 'Đăng nhập Google thành công');
};

exports.googleStatus = (req, res) => success(res, { enabled: googleEnabled });
