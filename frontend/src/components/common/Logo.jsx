import { Link } from 'react-router-dom';

/** Wordmark "tiktak." — dấu chấm màu son là nhịp "tak" của kim đồng hồ */
export default function Logo({ className = '' }) {
  return (
    <Link to="/" className={`inline-flex items-baseline text-[26px] font-extrabold leading-none tracking-[-0.045em] text-fg ${className}`} aria-label="TikTak — Trang chủ">
      tiktak<span className="ml-[1px] inline-block h-[6px] w-[6px] rounded-[1.5px] bg-brand" />
    </Link>
  );
}
