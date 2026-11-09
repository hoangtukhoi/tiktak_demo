import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { ChevronDown, ChevronUp, RotateCw, Search } from 'lucide-react';
import VideoCard from '../../components/video/VideoCard';
import useInfiniteScroll from '../../hooks/useInfiniteScroll';
import useAuth from '../../hooks/useAuth';
import useVideoStore from '../../store/slices/videoSlice';
import { getFollowingFeed, getForYouFeed } from '../../api/video.api';
import { errMsg } from '../../api/axiosClient';

/** Tab trên cùng: mobile nằm trên video (chữ trắng), desktop nằm trên nền trang */
function Tabs() {
  const cls = ({ isActive }) => `relative px-1 pb-1.5 text-md font-bold transition-colors after:absolute after:inset-x-1/4 after:bottom-0 after:h-[3px] after:rounded-full
    ${isActive ? 'text-white after:bg-white lg:text-fg lg:after:bg-fg' : 'text-white/60 hover:text-white/90 lg:text-fg-muted lg:hover:text-fg'}`;
  return (
    <div className="absolute inset-x-0 top-0 z-20 flex h-14 items-center justify-center pt-[env(safe-area-inset-top)] lg:static lg:h-auto lg:pt-5">
      <nav className="text-shadow flex gap-5 lg:[text-shadow:none]" aria-label="Bảng tin">
        <NavLink to="/following" className={cls}>Đang theo dõi</NavLink>
        <NavLink to="/" end className={cls}>Dành cho bạn</NavLink>
      </nav>
      <Link to="/search" className="absolute right-3 grid h-10 w-10 place-items-center text-white lg:hidden" aria-label="Tìm kiếm"><Search size={22} /></Link>
    </div>
  );
}

function Empty({ title, children }) {
  return (
    <div className="grid h-full place-items-center bg-black px-6 text-center text-white lg:bg-transparent lg:text-fg">
      <div className="max-w-sm"><p className="text-lg font-bold">{title}</p><div className="mt-2 opacity-70">{children}</div></div>
    </div>
  );
}

export default function Home({ tab = 'for-you' }) {
  const { isAuthenticated } = useAuth();
  const toggleMute = useVideoStore((s) => s.toggleMute);
  const [videos, setVideos] = useState([]);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [hasMore, setHasMore] = useState(true);
  const [active, setActive] = useState(0);
  const page = useRef(0);
  const busy = useRef(false);
  const scroller = useRef(null);
  const needsLogin = tab === 'following' && !isAuthenticated;

  const load = useCallback(async (reset = false) => {
    if (busy.current || needsLogin) return;
    busy.current = true;
    if (reset) { page.current = 0; setStatus('loading'); }
    try {
      const batch = await (tab === 'following' ? getFollowingFeed : getForYouFeed)(page.current || undefined);
      page.current += 1;
      setVideos((prev) => {
        const base = reset ? [] : prev;
        const seen = new Set(base.map((v) => v._id));
        const fresh = batch.filter((v) => !seen.has(v._id));
        if (!fresh.length) setHasMore(false);   // backend chưa phân trang: hết video mới thì dừng
        return [...base, ...fresh];
      });
      setStatus('ready');
    } catch (e) { setError(errMsg(e, 'Không tải được bảng tin')); setStatus('error'); }
    finally { busy.current = false; }
  }, [tab, needsLogin]);

  useEffect(() => { setVideos([]); setHasMore(true); setActive(0); scroller.current?.scrollTo({ top: 0 }); load(true); }, [load]);

  useEffect(() => {
    const root = scroller.current;
    if (!root) return;
    const io = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && setActive(Number(e.target.dataset.index))), { root, threshold: 0.6 });
    root.querySelectorAll('[data-index]').forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [videos.length]);

  const go = (dir) => scroller.current?.scrollBy({ top: dir * scroller.current.clientHeight, behavior: 'smooth' });
  useEffect(() => {
    const onKey = (e) => {
      if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName) || document.querySelector('[role=dialog]')) return;
      if (e.key === 'ArrowDown' || e.key === 'j') { e.preventDefault(); go(1); }
      if (e.key === 'ArrowUp' || e.key === 'k') { e.preventDefault(); go(-1); }
      if (e.key === 'm') toggleMute();
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [toggleMute]);

  const sentinel = useInfiniteScroll(useCallback(() => load(), [load]), hasMore && status === 'ready', scroller);

  let body;
  if (needsLogin) body = <Empty title="Video từ người bạn theo dõi"><p>Đăng nhập để xem bảng tin của riêng bạn.</p><Link to="/login" state={{ from: '/following' }} className="btn-primary mt-5">Đăng nhập</Link></Empty>;
  else if (status === 'loading' && !videos.length) body = <div className="flex h-full justify-center bg-black lg:bg-transparent lg:py-5"><div className="skeleton h-full w-full lg:aspect-[9/16] lg:w-auto lg:rounded-xl" /></div>;
  else if (status === 'error' && !videos.length) body = <Empty title="Không tải được bảng tin"><p>{error}</p><button onClick={() => load(true)} className="btn-primary mt-5"><RotateCw size={16} /> Thử lại</button></Empty>;
  else if (!videos.length) body = tab === 'following'
    ? <Empty title="Chưa có video mới"><p>Những người bạn theo dõi chưa đăng gì. Khám phá thêm nhà sáng tạo nhé.</p><Link to="/search" className="btn-primary mt-5">Khám phá</Link></Empty>
    : <Empty title="Chưa có video nào"><p>Hãy là người đầu tiên đăng video.</p><Link to="/upload" className="btn-primary mt-5">Tải video lên</Link></Empty>;

  return (
    <div className="relative flex h-full flex-col bg-black lg:bg-bg">
      <Tabs />
      <div className="relative min-h-0 flex-1">
        {body || (
          <div ref={scroller} className="no-scrollbar h-full snap-y snap-mandatory overflow-y-scroll overscroll-contain">
            {videos.map((v, i) => (
              <div key={v._id} data-index={i} className="h-full snap-start snap-always">
                <VideoCard video={v} active={i === active} near={Math.abs(i - active) <= 1} />
              </div>
            ))}
            {hasMore && <div ref={sentinel} className="h-px" />}
          </div>
        )}
        {!body && (
          <div className="absolute right-6 top-1/2 z-20 hidden -translate-y-1/2 flex-col gap-2 xl:flex">
            <button onClick={() => go(-1)} disabled={active === 0} className="btn-secondary !h-11 !w-11 !rounded-full !p-0" aria-label="Video trước"><ChevronUp size={22} /></button>
            <button onClick={() => go(1)} disabled={active >= videos.length - 1} className="btn-secondary !h-11 !w-11 !rounded-full !p-0" aria-label="Video sau"><ChevronDown size={22} /></button>
          </div>
        )}
      </div>
    </div>
  );
}
