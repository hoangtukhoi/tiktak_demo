const { Queue } = require('bullmq');
const redis = require('../config/redis');
exports.transcodeQueue = new Queue('video-transcode', { connection: redis });
exports.dubbingQueue = new Queue('video-dubbing', { connection: redis });
console.log('Queues initialized: video-transcode, video-dubbing');