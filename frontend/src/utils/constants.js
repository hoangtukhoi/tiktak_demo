export const ROUTES = {
  HOME: '/',
  LOGIN: '/login',
  REGISTER: '/register',
  PROFILE: '/profile',
  UPLOAD: '/upload',
  WATCH: '/watch',
  SEARCH: '/search',
  ADMIN: '/admin',
};

export const SOCKET_EVENTS = {
  NOTIFICATION: 'notification',
  TRANSCODE_PROGRESS: 'transcode:progress',
  DUBBING_PROGRESS: 'dubbing:progress',
};

export const DUBBING_STATUS_LABELS = {
  pending: 'Đang chờ',
  extracting: 'Đang tách âm thanh',
  transcribing: 'Đang nhận dạng lời thoại',
  translating: 'Đang dịch',
  synthesizing: 'Đang tổng hợp giọng nói',
  done: 'Hoàn tất',
  failed: 'Thất bại',
};

export const REPORT_REASONS = [
  { value: 'spam', label: 'Spam' },
  { value: 'violence', label: 'Bạo lực' },
  { value: 'nudity', label: 'Nội dung nhạy cảm' },
  { value: 'hate_speech', label: 'Ngôn từ thù ghét' },
  { value: 'misinformation', label: 'Thông tin sai lệch' },
  { value: 'copyright', label: 'Vi phạm bản quyền' },
  { value: 'other', label: 'Lý do khác' },
];

export const MAX_VIDEO_SIZE_MB = 500;
