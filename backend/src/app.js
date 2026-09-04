require('express-async-errors');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const passport = require('passport');
const routes = require('./routes');
const { errorMiddleware } = require('./middlewares/error.middleware');
const { apiLimiter } = require('./middlewares/rateLimit.middleware');

require('./config/passport');

const app = express();
app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL, credentials: true }));
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(passport.initialize());

app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.use('/api', apiLimiter, routes);
app.use(errorMiddleware);

module.exports = app;