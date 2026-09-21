require('express-async-errors');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');

const { env } = require('./config/env');
const passport = require('./config/passport');
const routes = require('./routes');
const { errorMiddleware, notFoundMiddleware } = require('./middlewares/error.middleware');
const { apiLimiter } = require('./middlewares/rateLimit.middleware');
const logger = require('./utils/logger');

const app = express();

app.set('trust proxy', 1);
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(
  cors({
    origin: [env.FRONTEND_URL],
    credentials: true,
  })
);
// SSE không nén để sự kiện được đẩy đi ngay.
app.use(compression({ filter: (req, res) => !req.path.endsWith('/progress') && compression.filter(req, res) }));
app.use(
  morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev', {
    stream: { write: (msg) => logger.http?.(msg.trim()) || logger.info(msg.trim()) },
  })
);
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(passport.initialize());

app.get('/health', (req, res) =>
  res.json({ status: 'ok', env: env.NODE_ENV, uptimeSec: Math.round(process.uptime()) })
);

app.use('/api', apiLimiter, routes);

app.use(notFoundMiddleware);
app.use(errorMiddleware);

module.exports = app;
