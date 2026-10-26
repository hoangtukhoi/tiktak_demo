import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Search as SearchIcon, X } from 'lucide-react';
import Avatar from '../../components/common/Avatar';
import { VideoTile } from '../../components/video/VideoCard';
import { getForYouFeed, searchVideos } from '../../api/video.api';
import { searchUsers } from '../../api/auth.api';
import { formatCount } from '../../utils/format';

function Grid({ videos }) {
  if (videos === null) return <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{Array.from({ length: 8 }, (_, i) => <span key={i} className="skeleton aspect-[3/4] rounded-2xl" />)}</div>;
  return <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{videos.map((v, i) => <VideoTile key={v._id} video={v} index={i} />)}</div>;
}

export default function Search() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const q = params.get('q') || '';
  const [input, setInput] = useState(q);
  const [tab, setTab] = useState('videos');
  const [videos, setVideos] = useState(null);
  const [users, setUsers] = useState(null);
  const [trending, setTrending] = useState(null);

  useEffect(() => setInput(q), [q]);

  useEffect(() => {
    let alive = true;
    if (!q) {
      // chưa có endpoint xu hướng: lấy từ feed for-you
      getForYouFeed().then((vs) => {
        if (!alive) return;
        setTrending(vs);
        setVideos(vs);
      }).catch(() => { setTrending([]); setVideos([]); });
      return () => { alive = false; };
    }
    setVideos(null); setUsers(null);
    const term = q.replace(/^#/, '');
    searchVideos(term).then((v) => alive && setVideos(v)).catch(() => alive && setVideos([]));
    searchUsers(term).then((u) => alive && setUsers(u)).catch(() => alive && setUsers([]));
    return () => { alive = false; };
  }, [q]);

  const tags = trending ? Object.entries(trending.flatMap((v) => v.hashtags).reduce((m, t) => ({ ...m, [t]: (m[t] || 0) + 1 }), {})).sort((a, b) => b[1] - a[1]).slice(0, 16) : [];
  const submit = (e) => { e.preventDefault(); navigate(input.trim() ? `/search?q=${encodeURIComponent(input.trim())}` : '/search'); };

  return (
    <div className="mx-auto max-w-[1100px] px-4 pb-16 pt-6 sm:px-8">
      <form onSubmit={submit} role="search" className="md:hidden">
        <label className="flex items-center gap-2 rounded-full border border-ink-500 bg-ink-800 px-4 focus-within:border-lime">
          <SearchIcon size={18} className="text-paper-mute" />
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Tìm kiếm" className="h-11 w-full bg-transparent outline-none" autoFocus={!q} />
          {input && <button type="button" onClick={() => { setInput(''); navigate('/search'); }} aria-label="Xoá"><X size={18} /></button>}
        </label>
      </form>

      {!q ? (
        <>
          <header className="mb-8 mt-6 md:mt-2">
            <p className="label">Khám phá</p>
            <h1 className="mt-2 text-4xl font-extrabold sm:text-5xl">Đang nổi trên TikTak</h1>
          </header>
          {tags.length > 0 && (
            <div className="mb-10 flex flex-wrap gap-2">
              {tags.map(([t, n], i) => (
                <motion.div key={t} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.03 }}>
                  <Link to={`/search?q=%23${t}`} className="chip">#{t}<span className="font-mono text-[11px] opacity-60">{n}</span></Link>
                </motion.div>
              ))}
            </div>
          )}
          <Grid videos={videos} />
        </>
      ) : (
        <>
          <header className="mb-6 mt-6 md:mt-2">
            <p className="label">Kết quả tìm kiếm</p>
            <h1 className="mt-2 break-words text-4xl font-extrabold">“{q}”</h1>
          </header>
          <div className="mb-6 flex gap-1 rounded-full bg-ink-800 p-1 sm:w-max">
            {[['videos', 'Video', videos?.length], ['users', 'Người dùng', users?.length]].map(([k, label, n]) => (
              <button key={k} onClick={() => setTab(k)} className="relative flex-1 rounded-full px-5 py-2 text-sm font-bold sm:flex-none">
                {tab === k && <motion.span layoutId="search-tab" className="absolute inset-0 rounded-full bg-lime" transition={{ type: 'spring', damping: 30, stiffness: 380 }} />}
                <span className={`relative ${tab === k ? 'text-ink' : 'text-paper-dim'}`}>{label} {n != null && <span className="font-mono text-xs opacity-70">{n}</span>}</span>
              </button>
            ))}
          </div>

          {tab === 'videos' ? (
            videos?.length === 0 ? (
              <p className="card px-6 py-14 text-center text-paper-dim">Không có video nào khớp. Thử từ khoá ngắn hơn hoặc một #hashtag.</p>
            ) : <Grid videos={videos} />
          ) : users === null ? (
            <div className="space-y-2">{[0, 1, 2].map((i) => <span key={i} className="skeleton block h-20 rounded-2xl" />)}</div>
          ) : users.length ? (
            <ul className="grid gap-2 sm:grid-cols-2">
              {users.map((u, i) => (
                <motion.li key={u._id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                  <Link to={`/profile/${u.username}`} className="flex items-center gap-4 rounded-2xl bg-ink-800 p-4 transition hover:bg-ink-700">
                    <Avatar user={u} size={52} />
                    <span className="min-w-0">
                      <span className="block truncate font-extrabold">@{u.username}</span>
                      <span className="block truncate text-sm text-paper-dim">{u.bio || '—'}</span>
                      <span className="font-mono text-xs text-paper-mute">{formatCount(u.followerCount || 0)} người theo dõi</span>
                    </span>
                  </Link>
                </motion.li>
              ))}
            </ul>
          ) : (
            <p className="card px-6 py-14 text-center text-paper-dim">Không tìm thấy người dùng nào.</p>
          )}
        </>
      )}
    </div>
  );
}
