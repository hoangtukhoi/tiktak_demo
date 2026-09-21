const passport = require('passport');
const { Strategy: JwtStrategy, ExtractJwt } = require('passport-jwt');
const { Strategy: GoogleStrategy } = require('passport-google-oauth20');
const User = require('../models/User');
const authService = require('../services/auth.service');
const { env } = require('./env');
const logger = require('../utils/logger');

passport.use(
  new JwtStrategy(
    {
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: env.JWT_SECRET,
    },
    async (payload, done) => {
      try {
        const user = await User.findById(payload.sub);
        return user ? done(null, user) : done(null, false);
      } catch (err) {
        return done(err, false);
      }
    }
  )
);

if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        callbackURL: env.GOOGLE_CALLBACK_URL,
        scope: ['profile', 'email'],
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const email = profile.emails?.[0]?.value;
          if (!email) return done(new Error('Tài khoản Google không có email công khai'), false);
          const baseUsername = (profile.displayName || email.split('@')[0])
            .toLowerCase()
            .replace(/[^a-z0-9_]/g, '')
            .slice(0, 24) || 'user';
          const result = await authService.googleAuth(
            profile.id,
            email,
            baseUsername,
            profile.photos?.[0]?.value || null
          );
          return done(null, result);
        } catch (err) {
          return done(err, false);
        }
      }
    )
  );
} else {
  logger.warn('Chưa cấu hình GOOGLE_CLIENT_ID/SECRET, bỏ qua đăng nhập Google.');
}

/** Cho phép route kiểm tra trước khi gắn handler Google. */
const isGoogleEnabled = () => Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

module.exports = passport;
module.exports.isGoogleEnabled = isGoogleEnabled;
