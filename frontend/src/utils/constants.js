export const ROUTES = {
  HOME: '/', FOLLOWING: '/following', LOGIN: '/login', REGISTER: '/register', PROFILE: '/profile',
  UPLOAD: '/upload', WATCH: '/watch', SEARCH: '/search', ADMIN: '/admin',
};

// Khớp backend utils/constants.js
export const MAX_VIDEO_SIZE_MB = 500;
export const MAX_VIDEO_DURATION_S = 180;

export const LANG_FLAGS = { vi: 'VI', en: 'EN', zh: 'ZH', ja: 'JA', ko: 'KO', fr: 'FR', de: 'DE', es: 'ES', th: 'TH', id: 'ID' };

// AudioTrack.status -> nhãn hiển thị + tiến độ ước lượng
export const DUB_STEPS = {
  pending: { label: 'Đang xếp hàng', pct: 8 },
  transcribing: { label: 'Nhận dạng giọng nói', pct: 32 },
  translating: { label: 'Dịch nội dung', pct: 58 },
  synthesizing: { label: 'Tổng hợp giọng nói', pct: 84 },
  done: { label: 'Hoàn tất', pct: 100 },
  failed: { label: 'Thất bại', pct: 100 },
};

// Lý do báo cáo video — khớp backend models/Report.js (REPORT_REASONS)
export const REPORT_REASONS = [
  { value: 'spam', label: 'Spam hoặc lừa đảo', hint: 'Quảng cáo rác, lừa tiền, câu view' },
  { value: 'sexual', label: 'Nội dung khiêu dâm', hint: 'Khoả thân, gợi dục' },
  { value: 'violence', label: 'Bạo lực', hint: 'Đánh nhau, máu me, đe doạ' },
  { value: 'harassment', label: 'Quấy rối hoặc bắt nạt', hint: 'Xúc phạm, nhắm vào một người' },
  { value: 'hate', label: 'Ngôn từ thù ghét', hint: 'Phân biệt vùng miền, sắc tộc, giới tính' },
  { value: 'dangerous', label: 'Hành vi nguy hiểm', hint: 'Thử thách nguy hiểm, tự gây hại' },
  { value: 'misinformation', label: 'Thông tin sai lệch', hint: 'Tin giả, sai sự thật' },
  { value: 'child_safety', label: 'An toàn trẻ em', hint: 'Nội dung gây hại cho trẻ vị thành niên' },
  { value: 'copyright', label: 'Vi phạm bản quyền', hint: 'Dùng lại video, nhạc của người khác' },
  { value: 'other', label: 'Lý do khác', hint: 'Mô tả thêm ở bên dưới' },
];
export const REPORT_REASON_LABEL = Object.fromEntries(REPORT_REASONS.map((r) => [r.value, r.label]));
