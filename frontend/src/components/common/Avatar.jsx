import { BadgeCheck } from 'lucide-react';

// Màu nền chữ cái đầu: chọn cố định theo tên, trong dải màu đất dịu để không tranh với màu brand
const TONES = ['#C9A27E', '#A8B59A', '#9DB2BF', '#C7A3A0', '#B9A8C9', '#D1B98A', '#A3BFB2', '#BFA58E'];
const tone = (s = '') => TONES[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % TONES.length];

export default function Avatar({ user, size = 40, badge = false, className = '' }) {
  const name = user?.username || '?';
  return (
    <span className={`relative inline-block shrink-0 ${className}`} style={{ width: size, height: size }}>
      {user?.avatarUrl ? (
        <img src={user.avatarUrl} alt="" className="h-full w-full rounded-full object-cover" />
      ) : (
        <span className="grid h-full w-full select-none place-items-center rounded-full font-semibold text-[#1a1714]" style={{ background: tone(name), fontSize: Math.round(size * 0.4) }}>
          {name[0].toUpperCase()}
        </span>
      )}
      {badge && user?.isVerified && (
        <BadgeCheck className="absolute -bottom-0.5 -right-0.5 rounded-full bg-bg text-brand-text" size={Math.max(14, size * 0.3)} aria-label="Đã xác minh" />
      )}
    </span>
  );
}
