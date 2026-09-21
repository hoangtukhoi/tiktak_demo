module.exports = {
  QUEUES: {
    TRANSCODE: 'video-transcode',
    DUBBING: 'video-dubbing',
  },

  SOCKET_EVENTS: {
    NOTIFICATION: 'notification',
    TRANSCODE_PROGRESS: 'transcode:progress',
    DUBBING_PROGRESS: 'dubbing:progress',
  },

  NOTIFICATION_TYPES: {
    NEW_LIKE: 'new_like',
    NEW_COMMENT: 'new_comment',
    NEW_FOLLOWER: 'new_follower',
    VIDEO_READY: 'video_ready',
    DUBBING_DONE: 'dubbing_done',
    MENTION: 'mention',
  },

  VIDEO_STATUSES: ['uploading', 'processing', 'ready', 'failed'],
  MODERATION_STATUSES: ['pending', 'approved', 'removed', 'flagged'],
  DUBBING_STATUSES: ['pending', 'extracting', 'transcribing', 'translating', 'synthesizing', 'done', 'failed'],

  SUPPORTED_LANGS: [
    { code: 'vi', name: 'Tiếng Việt' },
    { code: 'en', name: 'English' },
    { code: 'zh', name: '中文' },
    { code: 'ja', name: '日本語' },
    { code: 'ko', name: '한국어' },
    { code: 'fr', name: 'Français' },
    { code: 'de', name: 'Deutsch' },
    { code: 'es', name: 'Español' },
    { code: 'th', name: 'ภาษาไทย' },
    { code: 'id', name: 'Bahasa Indonesia' },
  ],

  // Các mức chất lượng sinh ra khi transcode sang HLS.
  HLS_VARIANTS: [
    { name: '360p', width: 360, height: 640, videoBitrate: '800k', audioBitrate: '96k', bandwidth: 900000 },
    { name: '720p', width: 720, height: 1280, videoBitrate: '2500k', audioBitrate: '128k', bandwidth: 2800000 },
    { name: '1080p', width: 1080, height: 1920, videoBitrate: '5000k', audioBitrate: '192k', bandwidth: 5400000 },
  ],
  HLS_SEGMENT_SECONDS: 4,

  MAX_VIDEO_SIZE_MB: 500,
  MAX_VIDEO_DURATION_S: 600,
  MAX_IMAGE_SIZE_MB: 5,

  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 50,

  JWT_COOKIE_OPTIONS: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
  },
};
