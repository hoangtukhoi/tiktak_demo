export const formatCount = (n = 0) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1).replace(/\.0$/, '')}K` : String(n);

export const formatDuration = (ms = 0) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export const timeAgo = (dateStr) => {
  if (!dateStr) return '';
  const s = (Date.now() - new Date(dateStr)) / 1000;
  if (s < 60) return 'Vừa xong';
  if (s < 3600) return `${Math.floor(s / 60)} phút`;
  if (s < 86400) return `${Math.floor(s / 3600)} giờ`;
  if (s < 604800) return `${Math.floor(s / 86400)} ngày`;
  return new Date(dateStr).toLocaleDateString('vi-VN');
};

/** "#a #b, c" -> ['a','b','c'] (backend lưu hashtags lowercase, không có '#') */
export const parseHashtags = (str = '') =>
  [...new Set(str.split(/[\s,]+/).map((t) => t.replace(/^#/, '').toLowerCase()).filter(Boolean))].slice(0, 10);
