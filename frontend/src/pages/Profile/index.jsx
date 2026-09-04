import { useParams } from 'react-router-dom';
import Header from '../../components/layout/Header';
import Sidebar from '../../components/layout/Sidebar';
import Avatar from '../../components/common/Avatar';
import Button from '../../components/common/Button';
export default function Profile() {
  const { username } = useParams();
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <div className="flex flex-1 pt-16">
        <Sidebar />
        <main className="flex-1 lg:ml-64 p-8 max-w-4xl mx-auto w-full">
          <div className="flex items-start gap-8 mb-8">
            <Avatar size="xl" username={username} />
            <div>
              <h1 className="text-3xl font-bold mb-2">{username}</h1>
              <div className="flex gap-6 mb-4 text-gray-300">
                <span><strong className="text-white">0</strong> Đang theo dõi</span>
                <span><strong className="text-white">0</strong> Follower</span>
                <span><strong className="text-white">0</strong> Thích</span>
              </div>
              <Button>Theo dõi</Button>
            </div>
          </div>
          <div className="border-t border-white/10 pt-4">
            <h2 className="text-xl font-bold mb-4">Video</h2>
            <div className="grid grid-cols-3 gap-2 sm:gap-4">
              <div className="aspect-[3/4] bg-white/5 rounded-lg flex items-center justify-center text-gray-500">Trống</div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
