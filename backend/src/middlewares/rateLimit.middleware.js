const rateLimit = require('express-rate-limit');
exports.apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200 });
exports.authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10 });
exports.uploadLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 20 });