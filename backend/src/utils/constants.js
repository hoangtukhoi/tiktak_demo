module.exports = {
  JWT_COOKIE_OPTIONS: { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict' },
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
  VIDEO_STATUSES: ['uploading', 'processing', 'ready', 'failed'],
  MAX_VIDEO_SIZE_MB: 500,
  MAX_VIDEO_DURATION_S: 180,
};