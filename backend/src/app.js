require('express-async-errors');
const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const passport = require('passport');
const routes = require('./routes');
const { errorMiddleware } = require('./middlewares/error.middleware');
const { apiLimiter } = require('./middlewares/rateLimit.middleware');

require('./config/passport');

const app = express();
app.use(helmet({ contentSecurityPolicy: false }));
// Chỉ cho phép frontend đã khai báo (FRONTEND_URL, có thể nhiều URL cách nhau dấu phẩy).
// Khi dev, cho phép thêm mọi localhost/127.0.0.1.
const allowedOrigins = (process.env.FRONTEND_URL || '')
  .split(',')
  .map((o) => o.trim().replace(/\/$/, ''))
  .filter(Boolean);
const isDevLocalhost = (origin) =>
  process.env.NODE_ENV !== 'production' && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin || allowedOrigins.includes(origin) || isDevLocalhost(origin)) return cb(null, true);
      return cb(null, false);
    },
    credentials: true,
  })
);
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(passport.initialize());

// Serve test UI
app.use('/test', express.static(path.join(__dirname, '../public')));
app.get('/', (req, res) => res.redirect('/test/'));

app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.use('/api', apiLimiter, routes);
app.use(errorMiddleware);

module.exports = app;