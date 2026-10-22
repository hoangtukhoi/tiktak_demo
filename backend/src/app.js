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
app.use(cors({ origin: true, credentials: true }));
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