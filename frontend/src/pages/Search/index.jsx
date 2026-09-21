import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';

import Header from '../../components/layout/Header';
import Sidebar from '../../components/layout/Sidebar';
import Avatar from '../../components/common/Avatar';
import Spinner from '../../components/common/Spinner';
import { searchVideos, getTrendingHashtags } from '../../api/video.api';
import { searchUsers } from '../../api/user.api';
import { formatCount } from '../../utils/format';

const TABS = [
  { key: 'videos', label: 'Video' },
  { key: 'users', label: 'Người dùng' },
];

export default function Search() {
  const [searchParams] = useSearchParams();
  const q = searchParams.get('q') || '';

  const [tab, setTab] = useState('videos');
  const [videos, setVideos] = useState([]);
  const [users, setUsers] = useState([]);
  const [trending, setTrending] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getTrendingHashtags().then(setTrending).catch(() => {});
  }, []);

  useEffect(() => {
    if (!q) return;
    setLoading(true);
    Promise.all([searchVideos(q), searchUsers(q)])
      .then(([videoData, userData]) => {
        setVideos(videoData.videos || []);
        setUsers(userData || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [q]);

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <div className="flex flex-1 pt-16">
        <Sidebar />
        <main className="flex-1 lg:ml-64 p-4 sm:p-8">
          {!q ? (
            <section>
              <h1 className="text-2xl font-bold mb-4">Hashtag thịnh hành</h1>
              <div className="flex flex-wrap gap-2">
                {trending.map((t) => (
                  <Link
                    key={t.hashtag}
                    to={`/search?q=%23${t.hashtag}`}
                    className="px-4 py-2 rounded-full bg-white/5 hover:bg-white/10 text-sm"
                  >
                    #{t.hashtag}
                    <span className="ml-2 text-gray-400">{formatCount(t.viewCount)}</span>
                  </Link>
                ))}
                {!trending.length && <p className="text-gray-400">Chưa có dữ liệu</p>}
              </div>
            </section>
          ) : (
            <>
              <h1 className="text-2xl font-bold mb-4">Kết quả cho: {q}</h1>

              <div className="flex gap-6 border-b border-white/10 mb-6">
                {TABS.map((t) => (
                  <button
                    key={t.key}
                    onClick={() => setTab(t.key)}
                    className={`pb-3 text-sm font-semibold border-b-2 transition-colors ${
                      tab === t.key ? 'border-brand-from text-white' : 'border-transparent text-gray-400'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {loading && (
                <div className="flex justify-center py-10">
                  <Spinner />
                </div>
              )}

              {!loading && tab === 'videos' && (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                  {videos.map((v) => (
                    <Link key={v._id} to={`/watch/${v._id}`} className="group">
                      <div className="aspect-[3/4] bg-white/5 rounded-lg overflow-hidden">
                        {v.thumbnailUrl ? (
                          <img
                            src={v.thumbnailUrl}
                            alt={v.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-500 text-sm">
                            Không có ảnh
                          </div>
                        )}
                      </div>
                      <p className="mt-2 text-sm line-clamp-2">{v.title}</p>
                      <p className="text-xs text-gray-400">{formatCount(v.viewCount)} lượt xem</p>
                    </Link>
                  ))}
                  {!videos.length && <p className="text-gray-400">Không tìm thấy video nào</p>}
                </div>
              )}

              {!loading && tab === 'users' && (
                <div className="flex flex-col gap-2 max-w-2xl">
                  {users.map((u) => (
                    <Link
                      key={u._id}
                      to={`/profile/${u.username}`}
                      className="flex items-center gap-3 p-3 rounded-lg hover:bg-white/5"
                    >
                      <Avatar src={u.avatarUrl} username={u.username} size="md" />
                      <div className="min-w-0">
                        <p className="font-semibold">{u.username}</p>
                        <p className="text-sm text-gray-400 truncate">
                          {formatCount(u.followerCount)} follower
                          {u.bio ? ` · ${u.bio}` : ''}
                        </p>
                      </div>
                    </Link>
                  ))}
                  {!users.length && <p className="text-gray-400">Không tìm thấy người dùng nào</p>}
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
