export const formatCount = (n) => n >= 1e6 ? `${(n/1e6).toFixed(1)}M` : n >= 1e3 ? `${(n/1e3).toFixed(1)}K` : String(n);
export const formatDuration = (ms) => { const s = Math.floor(ms/1000); const m = Math.floor(s/60); const sec = s%60; return `${m}:${String(sec).padStart(2,'0')}`; };
export const timeAgo = (dateStr) => {
  const diff = Date.now() - new Date(dateStr);
  const s = diff/1000, m = s/60, h = m/60, d = h/24;
  if (s < 60) return 'Vừa xong';
  if (m < 60) return `${Math.floor(m)} phút trước`;
  if (h < 24) return `${Math.floor(h)} giờ trước`;
  if (d < 7) return `${Math.floor(d)} ngày trước`;
  return new Date(dateStr).toLocaleDateString('vi-VN');
};
