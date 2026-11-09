export const ROUTES = {
  HOME: '/', FOLLOWING: '/following', LOGIN: '/login', REGISTER: '/register', PROFILE: '/profile',
  UPLOAD: '/upload', WATCH: '/watch', SEARCH: '/search', INBOX: '/inbox', ADMIN: '/admin',
};

// Khớp backend utils/constants.js
export const MAX_VIDEO_SIZE_MB = 500;
export const MAX_VIDEO_DURATION_S = 180;

export const LANG_FLAGS = { vi: 'VI', en: 'EN', zh: 'ZH', ja: 'JA', ko: 'KO', fr: 'FR', de: 'DE', es: 'ES', th: 'TH', id: 'ID' };

// Ai có thể xem video (plan.md: công khai / bạn bè / riêng tư)
export const VISIBILITY = [
  ['public', 'Mọi người'],
  ['friends', 'Bạn bè (theo dõi lẫn nhau)'],
  ['private', 'Chỉ mình tôi'],
];

// AudioTrack.status -> nhãn hiển thị + tiến độ ước lượng
export const DUB_STEPS = {
  pending: { label: 'Đang xếp hàng', pct: 8 },
  transcribing: { label: 'Nhận dạng giọng nói', pct: 32 },
  translating: { label: 'Đang dịch', pct: 58 },
  synthesizing: { label: 'Tổng hợp giọng nói', pct: 84 },
  done: { label: 'Hoàn tất', pct: 100 },
  failed: { label: 'Thất bại', pct: 100 },
};
