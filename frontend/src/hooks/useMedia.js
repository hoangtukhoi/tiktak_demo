import { useEffect, useState, useSyncExternalStore } from 'react';

/** true khi màn hình ≥ 1024px (desktop: có sidebar, bình luận mở dạng panel bên phải) */
const mq = typeof window !== 'undefined' ? window.matchMedia('(min-width: 1024px)') : null;
export const useIsDesktop = () =>
  useSyncExternalStore((cb) => { mq.addEventListener('change', cb); return () => mq.removeEventListener('change', cb); }, () => mq.matches);

/** Theme sáng/tối, lưu localStorage; index.html đã áp class trước khi render */
export function useTheme() {
  const [theme, setTheme] = useState(() => (document.documentElement.classList.contains('dark') ? 'dark' : 'light'));
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    try { localStorage.setItem('theme', theme); } catch { /* chế độ riêng tư */ }
  }, [theme]);
  return [theme, () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))];
}
