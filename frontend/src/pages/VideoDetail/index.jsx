import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import toast from 'react-hot-toast';

import Header from '../../components/layout/Header';
import VideoPlayer from '../../components/video/VideoPlayer';
import CommentList from '../../components/comment/CommentList';
import Avatar from '../../components/common/Avatar';
import Button from '../../components/common/Button';
import Spinner from '../../components/common/Spinner';
import LanguageSelector from '../../components/dubbing/LanguageSelector';
import { getVideo } from '../../api/video.api';
import { toggleFollow } from '../../api/user.api';
import { watchVideo, unwatchVideo } from '../../services/socket.service';
import { formatCount, timeAgo } from '../../utils/format';

export default function VideoDetail() {
  const { id } = useParams();
  const [video, setVideo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showLanguages, setShowLanguages] = useState(false);
  const [dubbing, setDubbing] = useState({ audioUrl: null, subtitleUrl: null, lang: null });

  useEffect(() => {
    setLoading(true);
    getVideo(id)
      .then(setVideo)
      .catch(() => toast.error('Không tìm thấy video'))
      .finally(() => setLoading(false));

    // Theo dõi tiến trình lồng tiếng của riêng video này.
    watchVideo(id);
    return () => unwatchVideo(id);
  }, [id]);

  const handleFollow = async () => {
    try {
      const result = await toggleFollow(video.author.username);
      setVideo({ ...video, isFollowingAuthor: result.isFollowing });
    } catch (err) {
      toast.error('Không thực hiện được thao tác');
    }
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!video) {
    return (
      <div className="h-screen flex flex-col">
        <Header />
        <div className="flex-1 flex items-center justify-center text-gray-400">
          Video không tồn tại hoặc đã bị gỡ
        </div>
      </div>
    );
  }

  const author = video.author || video.userId || {};

  return (
    <div className="h-screen flex flex-col">
      <Header />
      <div className="flex-1 flex flex-col lg:flex-row pt-16 bg-black overflow-hidden">
        <div className="flex-[2] relative min-h-[50vh]">
          <VideoPlayer
            src={video.hlsUrl || video.originalUrl}
            poster={video.thumbnailUrl}
            isActive
            videoId={video._id}
            dubbedAudioUrl={dubbing.audioUrl}
            subtitleUrl={dubbing.subtitleUrl}
            subtitleLang={dubbing.lang}
          />
        </div>

        <aside className="flex-1 glass border-l border-white/10 flex flex-col max-h-full">
          <div className="p-4 border-b border-white/10">
            <div className="flex items-center gap-3 mb-3">
              <Avatar src={author.avatarUrl} username={author.username} size="md" />
              <div className="flex-1 min-w-0">
                <p className="font-bold truncate">{author.username}</p>
                <p className="text-xs text-gray-400">{timeAgo(video.createdAt)}</p>
              </div>
              <Button size="sm" variant={video.isFollowingAuthor ? 'ghost' : 'primary'} onClick={handleFollow}>
                {video.isFollowingAuthor ? 'Đang theo dõi' : 'Theo dõi'}
              </Button>
            </div>

            <h1 className="font-semibold mb-1">{video.title}</h1>
            {video.description && <p className="text-sm text-gray-300 mb-2">{video.description}</p>}

            <div className="flex items-center gap-4 text-sm text-gray-400">
              <span>{formatCount(video.viewCount)} lượt xem</span>
              <span>{formatCount(video.likeCount)} thích</span>
              <button onClick={() => setShowLanguages(true)} className="text-brand-from hover:underline">
                Ngôn ngữ{dubbing.lang ? `: ${dubbing.lang.toUpperCase()}` : ''}
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-hidden">
            <CommentList videoId={video._id} />
          </div>
        </aside>
      </div>

      <LanguageSelector
        videoId={video._id}
        isOpen={showLanguages}
        onClose={() => setShowLanguages(false)}
        onSelect={({ lang, audioUrl, subtitleUrl }) =>
          setDubbing({ lang, audioUrl: audioUrl || null, subtitleUrl: subtitleUrl || null })
        }
      />
    </div>
  );
}
