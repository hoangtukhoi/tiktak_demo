import { BadgeCheck } from 'lucide-react';

const hue = (s = '') => [...s].reduce((a, c) => a + c.charCodeAt(0) * 7, 0) % 360;

export default function Avatar({ user, size = 40, ring = false, className = '' }) {
  const name = user?.username || '?';
  return (
    <span className={`relative inline-block shrink-0 ${className}`} style={{ width: size, height: size }}>
      {user?.avatarUrl ? (
        <img src={user.avatarUrl} alt={name} className={`h-full w-full rounded-full object-cover ${ring ? 'ring-2 ring-lime ring-offset-2 ring-offset-ink' : ''}`} />
      ) : (
        <span
          className={`grid h-full w-full place-items-center rounded-full font-extrabold text-ink ${ring ? 'ring-2 ring-lime ring-offset-2 ring-offset-ink' : ''}`}
          style={{ background: `hsl(${hue(name)} 42% 66%)`, fontSize: size * 0.42 }}
        >
          {name[0].toUpperCase()}
        </span>
      )}
      {user?.isVerified && size >= 56 && (
        <BadgeCheck className="absolute -bottom-0.5 -right-0.5 rounded-full bg-ink text-lime" size={size * 0.32} />
      )}
    </span>
  );
}
