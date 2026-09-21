import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import toast from 'react-hot-toast';

import Header from '../../components/layout/Header';
import Sidebar from '../../components/layout/Sidebar';
import Avatar from '../../components/common/Avatar';
import Button from '../../components/common/Button';
import Spinner from '../../components/common/Spinner';
import { getProfile, toggleFollow } from '../../api/user.api';
import { getUserVideos } from '../../api/video.api';
import { formatCount } from '../../utils/format';

export default function Profile() {
  const { username } = useParams();
  const [profile, setProfile] = useState(null);
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([getProfile(username), getUserVideos(username)])
      .then(([profileData, videoData]) => {
        setProfile(profileData);
        setVideos(videoData.videos || []);
      })
      .catch(() => toast.error('Không tìm thấy người dùng'))
      .finally(() => setLoading(false));
  }, [username]);

  const handleFollow = async () => {
    try {
      const result = await toggleFollow(username);
      setProfile((p) => ({
        ...p,
        isFollowing: result.isFollowing,
        followerCount: p.followerCount + (result.isFollowing ? 1 : -1),
      }));
    } catch (err) {
      toast.error(err.response?.data?.message || 'Không thực hiện được thao tác');
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <div className="flex flex-1 pt-16">
        <Sidebar />
        <main className="flex-1 lg:ml-64 p-4 sm:p-8 max-w-4xl mx-auto w-full">
          {loading && (
            <div className="flex justify-center py-16">
              <Spinner size="lg" />
            </div>
          )}

          {!loading && profile && (
            <>
              <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 sm:gap-8 mb-8">
                <Avatar src={profile.avatarUrl} size="xl" username={profile.username} />
                <div className="text-center sm:text-left">
                  <h1 className="text-3xl font-bold mb-2">{profile.username}</h1>
                  <div className="flex gap-6 mb-4 text-gray-300 justify-center sm:justify-start">
                    <span>
                      <strong className="text-white">{formatCount(profile.followingCount)}</strong> Đang theo dõi
                    </span>
                    <span>
                      <strong className="text-white">{formatCount(profile.followerCount)}</strong> Follower
                    </span>
                    <span>
                      <strong className="text-white">{formatCount(profile.totalLikes)}</strong> Thích
                    </span>
                  </div>
                  {profile.bio && <p className="text-sm text-gray-300 mb-4">{profile.bio}</p>}
                  {!profile.isSelf && (
                    <Button variant={profile.isFollowing ? 'ghost' : 'primary'} onClick={handleFollow}>
                      {profile.isFollowing ? 'Đang theo dõi' : 'Theo dõi'}
                    </Button>
                  )}
                </div>
              </div>

              <div className="border-t border-white/10 pt-4">
                <h2 className="text-xl font-bold mb-4">Video</h2>
                <div className="grid grid-cols-3 gap-2 sm:gap-4">
                  {videos.map((v) => (
                    <Link key={v._id} to={`/watch/${v._id}`} className="group">
                      <div className="aspect-[3/4] bg-white/5 rounded-lg overflow-hidden relative">
                        {v.thumbnailUrl ? (
                          <img
                            src={v.thumbnailUrl}
                            alt={v.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-500 text-xs">
                            Đang xử lý
                          </div>
                        )}
                        <span className="absolute bottom-1 left-2 text-xs">
                          {formatCount(v.viewCount)}
                        </span>
                      </div>
                    </Link>
                  ))}
                  {!videos.length && (
                    <div className="col-span-3 text-center text-gray-400 py-8">Chưa có video nào</div>
                  )}
                </div>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
