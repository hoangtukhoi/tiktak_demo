const IORedis = require('ioredis');
const { env } = require('./env');
const logger = require('../utils/logger');

// BullMQ yêu cầu maxRetriesPerRequest = null và enableReadyCheck = false.
const redis = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  lazyConnect: true,
});

redis.on('connect', () => logger.info('Redis connected'));
redis.on('error', (err) => logger.error(`Redis error: ${err.message}`));

/** Tạo connection riêng cho Worker để không dùng chung với queue/cache. */
const createRedisConnection = () =>
  new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null, enableReadyCheck: false });

module.exports = redis;
module.exports.createRedisConnection = createRedisConnection;
