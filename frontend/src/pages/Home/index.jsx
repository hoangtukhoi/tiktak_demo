import { useState, useEffect, useRef, useCallback } from 'react';

import Header from '../../components/layout/Header';
import Sidebar from '../../components/layout/Sidebar';
import BottomNav from '../../components/layout/BottomNav';
import VideoCard from '../../components/video/VideoCard';
import Spinner from '../../components/common/Spinner';
import { getForYouFeed, getFollowingFeed } from '../../api/video.api';
import useAuthStore from '../../store/slices/authSlice';

const TABS = [
  { key: 'for-you', label: 'Dành cho bạn' },
  { key: 'following', label: 'Đang theo dõi' },
];

export default function Home() {
  const [tab, setTab] = useState('for-you');
  const [videos, setVideos] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const containerRef = useRef(null);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const fetchPage = useCallback(
    async (nextCursor = null, replace = false) => {
      if (loading) return;
      setLoading(true);
      try {
        const fetcher = tab === 'following' ? getFollowingFeed : getForYouFeed;
        const data = await fetcher(nextCursor);
        setVideos((prev) => (replace ? data.videos : [...prev, ...data.videos]));
        setCursor(data.nextCursor);
        setHasMore(Boolean(data.hasMore));
      } catch (err) {
        setHasMore(false);
      } finally {
        setLoading(false);
      }
    },
    [tab, loading]
  );

  useEffect(() => {
    setVideos([]);
    setCursor(null);
    setHasMore(true);
    setActiveIndex(0);
    fetchPage(null, true);
  }, [tab]);

  // Tải thêm khi còn 3 video nữa là hết danh sách.
  const handleScroll = (e) => {
    const { scrollTop, clientHeight } = e.target;
    const index = Math.round(scrollTop / clientHeight);
    if (index !== activeIndex) setActiveIndex(index);
    if (hasMore && !loading && index >= videos.length - 3) fetchPage(cursor);
  };

  return (
    <div className="h-screen w-screen flex flex-col">
      <Header />
      <div className="flex flex-1 pt-16 overflow-hidden">
        <Sidebar />
        <main className="flex-1 lg:ml-64 bg-black relative flex flex-col items-center">
          <div className="flex gap-6 py-3 z-10">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                disabled={t.key === 'following' && !isAuthenticated}
                className={`text-sm font-semibold transition-colors disabled:opacity-40 ${
                  tab === t.key ? 'text-white' : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div
            ref={containerRef}
            onScroll={handleScroll}
            className="feed-container w-full max-w-[500px] flex-1 sm:rounded-lg overflow-hidden"
          >
            {videos.map((v, i) => (
              <div key={v._id} className="feed-item">
                <VideoCard video={v} isActive={i === activeIndex} />
              </div>
            ))}

            {!videos.length && !loading && (
              <div className="feed-item flex items-center justify-center text-gray-400 text-center px-8">
                {tab === 'following'
                  ? 'Hãy theo dõi một vài người để thấy video ở đây'
                  : 'Chưa có video nào. Hãy là người đăng đầu tiên.'}
              </div>
            )}

            {loading && (
              <div className="flex items-center justify-center py-8">
                <Spinner />
              </div>
            )}
          </div>
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
