import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { ChevronDown, ChevronUp, RotateCw } from 'lucide-react';
import VideoCard from '../../components/video/VideoCard';
import useInfiniteScroll from '../../hooks/useInfiniteScroll';
import useAuth from '../../hooks/useAuth';
import useVideoStore from '../../store/slices/videoSlice';
import { getFollowingFeed, getForYouFeed } from '../../api/video.api';
import { errMsg } from '../../api/axiosClient';

function Tabs() {
  const cls = ({ isActive }) =>
    `relative px-1 py-1.5 transition ${isActive ? 'text-white' : 'text-white/55 hover:text-white/80'} after:absolute after:inset-x-1 after:-bottom-0.5 after:h-[3px] after:rounded-full after:bg-lime after:transition-transform after:duration-500 after:ease-out ${isActive ? 'after:scale-x-100' : 'after:scale-x-0'}`;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-3 z-20 flex justify-center sm:top-5">
      <nav className="text-shadow pointer-events-auto flex gap-6 text-[17px] font-extrabold">
        <NavLink to="/following" className={cls}>Đang theo dõi</NavLink>
        <NavLink to="/" end className={cls}>Dành cho bạn</NavLink>
      </nav>
    </div>
  );
}

function Empty({ title, children }) {
  return (
    <div className="grid h-full place-items-center px-6 text-center">
      <div className="max-w-sm">
        <p className="text-3xl font-extrabold tracking-tight">{title}</p>
        <div className="mt-3 text-paper-dim">{children}</div>
      </div>
    </div>
  );
}

export default function Home({ tab = 'for-you' }) {
  const { isAuthenticated } = useAuth();
  const toggleMute = useVideoStore((s) => s.toggleMute);
  const [videos, setVideos] = useState([]);
  const [status, setStatus] = useState('loading'); // loading | ready | error
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
      const fetcher = tab === 'following' ? getFollowingFeed : getForYouFeed;
      const batch = await fetcher(page.current || undefined);
      page.current += 1;
      setVideos((prev) => {
        const base = reset ? [] : prev;
        const seen = new Set(base.map((v) => v._id));
        const fresh = batch.filter((v) => !seen.has(v._id));
        // backend chưa phân trang: hết video mới thì dừng
        if (!fresh.length) setHasMore(false);
        return [...base, ...fresh];
      });
      setStatus('ready');
    } catch (e) {
      setError(errMsg(e, 'Không tải được bảng tin'));
      setStatus('error');
    } finally {
      busy.current = false;
    }
  }, [tab, needsLogin]);

  useEffect(() => {
    setVideos([]); setHasMore(true); setActive(0);
    scroller.current?.scrollTo({ top: 0 });
    load(true);
  }, [load]);

  // Video nào đang chiếm > 60% khung hình là video active
  useEffect(() => {
    const root = scroller.current;
    if (!root) return;
    const io = new IntersectionObserver(
      (es) => es.forEach((e) => e.isIntersecting && setActive(Number(e.target.dataset.index))),
      { root, threshold: 0.6 }
    );
    root.querySelectorAll('[data-index]').forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [videos.length]);

  const go = (dir) => scroller.current?.scrollBy({ top: dir * scroller.current.clientHeight, behavior: 'smooth' });

  useEffect(() => {
    const onKey = (e) => {
      if (/INPUT|TEXTAREA/.test(document.activeElement?.tagName) || document.querySelector('[role=dialog]')) return;
      if (e.key === 'ArrowDown' || e.key === 'j') { e.preventDefault(); go(1); }
      if (e.key === 'ArrowUp' || e.key === 'k') { e.preventDefault(); go(-1); }
      if (e.key === 'm') toggleMute();
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [toggleMute]);

  const sentinel = useInfiniteScroll(useCallback(() => load(), [load]), hasMore && status === 'ready', scroller);

  let body;
  if (needsLogin) {
    body = (
      <Empty title="Xem video từ người bạn theo dõi">
        <p>Đăng nhập để có bảng tin riêng của bạn.</p>
        <Link to="/login" state={{ from: '/following' }} className="btn mt-5">Đăng nhập</Link>
      </Empty>
    );
  } else if (status === 'loading' && !videos.length) {
    body = (
      <div className="flex h-full items-center justify-center gap-5 sm:py-4">
        <div className="skeleton h-full w-full sm:aspect-[9/16] sm:w-auto sm:rounded-[28px]" />
        <div className="hidden flex-col gap-5 self-end pb-6 sm:flex">{[0, 1, 2, 3].map((i) => <span key={i} className="skeleton h-12 w-12 rounded-full" />)}</div>
      </div>
    );
  } else if (status === 'error' && !videos.length) {
    body = (
      <Empty title="Mất kết nối rồi">
        <p>{error}</p>
        <button onClick={() => load(true)} className="btn mt-5"><RotateCw size={17} /> Thử lại</button>
      </Empty>
    );
  } else if (!videos.length) {
    body = tab === 'following' ? (
      <Empty title="Chưa có gì ở đây">
        <p>Những người bạn theo dõi chưa đăng video nào. Khám phá thêm nhà sáng tạo nhé.</p>
        <Link to="/search" className="btn mt-5">Khám phá</Link>
      </Empty>
    ) : (
      <Empty title="Bảng tin đang trống">
        <p>Chưa có video nào sẵn sàng. Hãy là người đầu tiên đăng tải.</p>
        <Link to="/upload" className="btn mt-5">Tải video lên</Link>
      </Empty>
    );
  }

  return (
    <div className="relative h-full">
      <Tabs />
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
        <div className="absolute right-5 top-1/2 z-20 hidden -translate-y-1/2 flex-col gap-3 xl:flex">
          <button onClick={() => go(-1)} disabled={active === 0} className="grid h-11 w-11 place-items-center rounded-full bg-ink-700 transition hover:bg-ink-600 disabled:opacity-30" aria-label="Video trước"><ChevronUp /></button>
          <button onClick={() => go(1)} disabled={active >= videos.length - 1} className="grid h-11 w-11 place-items-center rounded-full bg-ink-700 transition hover:bg-ink-600 disabled:opacity-30" aria-label="Video sau"><ChevronDown /></button>
        </div>
      )}
    </div>
  );
}
