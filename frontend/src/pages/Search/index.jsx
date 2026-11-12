import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Hash, Search as SearchIcon, X } from 'lucide-react';
import Avatar from '../../components/common/Avatar';
import FollowButton from '../../components/common/FollowButton';
import { VideoTile } from '../../components/video/VideoCard';
import { getForYouFeed, searchVideos } from '../../api/video.api';
import { searchUsers } from '../../api/auth.api';
import { formatCount } from '../../utils/format';

const Grid = ({ videos }) => videos === null
  ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{Array.from({ length: 8 }, (_, i) => <span key={i} className="skeleton aspect-[3/4] rounded-md" />)}</div>
  : <div className="grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 lg:grid-cols-4">{videos.map((v, i) => <VideoTile key={v._id} video={v} index={i} from="search" />)}</div>;

function UserRow({ u }) {
  return (
    <li className="flex items-center gap-3 rounded py-2.5">
      <Link to={`/profile/${u.username}`} className="flex min-w-0 flex-1 items-center gap-3">
        <Avatar user={u} size={52} badge />
        <span className="min-w-0">
          <span className="block truncate font-semibold">{u.username}</span>
          <span className="block truncate text-sm text-fg-muted">{formatCount(u.followerCount || 0)} người theo dõi{u.bio ? ` · ${u.bio}` : ''}</span>
        </span>
      </Link>
      <FollowButton user={u} size="sm" />
    </li>
  );
}

export default function Search() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const q = params.get('q') || '';
  const [input, setInput] = useState(q);
  const [tab, setTab] = useState('top');
  const [videos, setVideos] = useState(null);
  const [users, setUsers] = useState(null);

  useEffect(() => { setInput(q); setTab('top'); }, [q]);
  useEffect(() => {
    let alive = true;
    setVideos(null); setUsers(null);
    if (!q) {
      // chưa có endpoint xu hướng: lấy từ feed for-you
      getForYouFeed().then((v) => alive && setVideos(v)).catch(() => alive && setVideos([]));
      return () => { alive = false; };
    }
    const term = q.replace(/^[#@]/, '');
    searchVideos(term).then((v) => alive && setVideos(v)).catch(() => alive && setVideos([]));
    searchUsers(term).then((u) => alive && setUsers(u)).catch(() => alive && setUsers([]));
    return () => { alive = false; };
  }, [q]);

  const tags = videos && !q ? Object.entries(videos.flatMap((v) => v.hashtags).reduce((m, t) => ({ ...m, [t]: (m[t] || 0) + 1 }), {})).sort((a, b) => b[1] - a[1]).slice(0, 12) : [];
  const submit = (e) => { e.preventDefault(); navigate(input.trim() ? `/search?q=${encodeURIComponent(input.trim())}` : '/search'); };

  return (
    <div className="mx-auto max-w-[1080px] px-4 pb-16 pt-4 lg:px-8 lg:pt-8">
      <form onSubmit={submit} role="search" className="lg:hidden">
        <label className="flex h-11 items-center gap-2 rounded bg-surface-2 px-3 text-fg-muted">
          <SearchIcon size={18} />
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Tìm kiếm" aria-label="Tìm kiếm" className="w-full bg-transparent text-base text-fg outline-none" autoFocus={!q} />
          {input && <button type="button" onClick={() => { setInput(''); navigate('/search'); }} aria-label="Xoá"><X size={18} /></button>}
        </label>
      </form>

      {!q ? (
        <>
          <h1 className="mt-6 text-xl font-bold lg:mt-0 lg:text-2xl">Khám phá</h1>
          {tags.length > 0 && (
            <div className="no-scrollbar -mx-4 mt-4 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:flex-wrap lg:px-0">
              {tags.map(([t]) => <Link key={t} to={`/search?q=%23${t}`} className="chip shrink-0"><Hash size={14} className="text-fg-muted" />{t}</Link>)}
            </div>
          )}
          <div className="mt-6"><Grid videos={videos} /></div>
        </>
      ) : (
        <>
          <h1 className="sr-only">Kết quả cho {q}</h1>
          <nav className="mt-4 flex gap-6 border-b border-line lg:mt-0" role="tablist">
            {[['top', 'Hàng đầu'], ['users', 'Người dùng'], ['videos', 'Video']].map(([k, label]) => (
              <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`tab ${tab === k ? 'tab-active' : ''}`}>{label}</button>
            ))}
          </nav>
          <div className="mt-5">
            {tab !== 'videos' && (users === null ? <div className="space-y-3">{[0, 1].map((i) => <span key={i} className="skeleton block h-14 rounded" />)}</div>
              : users.length > 0 && (
                <section className={tab === 'top' ? 'mb-6' : ''}>
                  {tab === 'top' && <h2 className="mb-1 text-md font-bold">Tài khoản</h2>}
                  <ul className="divide-y divide-line">{(tab === 'top' ? users.slice(0, 3) : users).map((u) => <UserRow key={u._id} u={u} />)}</ul>
                  {tab === 'top' && users.length > 3 && <button onClick={() => setTab('users')} className="mt-1 text-sm font-semibold text-brand-text hover:underline">Xem tất cả {users.length} tài khoản</button>}
                </section>
              ))}
            {tab !== 'users' && (
              <section>
                {tab === 'top' && videos?.length > 0 && <h2 className="mb-3 text-md font-bold">Video</h2>}
                <Grid videos={videos} />
              </section>
            )}
            {videos?.length === 0 && users?.length === 0 && (
              <div className="py-16 text-center"><p className="text-md font-semibold">Không có kết quả cho “{q}”</p><p className="mt-1 text-fg-muted">Thử từ khoá ngắn hơn hoặc một hashtag khác.</p></div>
            )}
            {tab === 'users' && users?.length === 0 && videos?.length !== 0 && <p className="py-12 text-center text-fg-muted">Không tìm thấy tài khoản nào.</p>}
            {tab === 'videos' && videos?.length === 0 && users?.length !== 0 && <p className="py-12 text-center text-fg-muted">Không tìm thấy video nào.</p>}
          </div>
        </>
      )}
    </div>
  );
}
