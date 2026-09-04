import { useState, useEffect, useRef } from 'react';
import Header from '../../components/layout/Header';
import Sidebar from '../../components/layout/Sidebar';
import BottomNav from '../../components/layout/BottomNav';
import VideoCard from '../../components/video/VideoCard';
import useInfiniteScroll from '../../hooks/useInfiniteScroll';
import { getForYouFeed } from '../../api/video.api';

export default function Home() {
  const [videos, setVideos] = useState([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef(null);

  useEffect(() => {
    getForYouFeed().then(data => setVideos(data.videos || [])).catch(console.error);
  }, []);

  const handleScroll = (e) => {
    const y = e.target.scrollTop;
    const h = e.target.clientHeight;
    const index = Math.round(y / h);
    if (index !== activeIndex) setActiveIndex(index);
  };

  return (
    <div className="h-screen w-screen flex flex-col">
      <Header />
      <div className="flex flex-1 pt-16 overflow-hidden">
        <Sidebar />
        <main className="flex-1 lg:ml-64 bg-black relative flex justify-center">
          <div ref={containerRef} onScroll={handleScroll} className="feed-container w-full max-w-[500px] h-full sm:rounded-lg sm:my-2 overflow-hidden">
            {videos.map((v, i) => (
              <div key={v._id} className="feed-item">
                <VideoCard video={v} isActive={i === activeIndex} />
              </div>
            ))}
          </div>
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
