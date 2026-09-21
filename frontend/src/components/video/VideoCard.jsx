import { useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';

import VideoPlayer from './VideoPlayer';
import ActionButtons from './ActionButtons';
import Avatar from '../common/Avatar';
import LanguageSelector from '../dubbing/LanguageSelector';
import { likeVideo } from '../../api/video.api';
import useAuthStore from '../../store/slices/authSlice';

/** Một video trong feed dọc, kèm nút tương tác và chọn ngôn ngữ lồng tiếng. */
export default function VideoCard({ video, isActive, onCommentClick }) {
  const [isLiked, setIsLiked] = useState(video.isLiked || false);
  const [likeCount, setLikeCount] = useState(video.likeCount || 0);
  const [showLanguages, setShowLanguages] = useState(false);
  const [dubbing, setDubbing] = useState({ audioUrl: null, subtitleUrl: null, lang: null });

  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const author = video.author || video.userId || {};

  const handleLike = async () => {
    if (!isAuthenticated) return toast.error('Bạn cần đăng nhập để thích video');
    // Cập nhật lạc quan, trả về trạng thái cũ nếu request lỗi.
    const prev = { isLiked, likeCount };
    setIsLiked(!isLiked);
    setLikeCount(likeCount + (isLiked ? -1 : 1));
    try {
      const result = await likeVideo(video._id);
      setIsLiked(result.isLiked);
      setLikeCount(result.likeCount);
    } catch (err) {
      setIsLiked(prev.isLiked);
      setLikeCount(prev.likeCount);
      toast.error('Không thực hiện được thao tác');
    }
  };

  const handleShare = async () => {
    const url = `${window.location.origin}/watch/${video._id}`;
    try {
      if (navigator.share) await navigator.share({ title: video.title, url });
      else {
        await navigator.clipboard.writeText(url);
        toast.success('Đã sao chép liên kết');
      }
    } catch (err) {
      // Người dùng huỷ hộp thoại chia sẻ, không cần báo lỗi.
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="w-full h-full relative bg-black"
    >
      <VideoPlayer
        src={video.hlsUrl || video.originalUrl}
        poster={video.thumbnailUrl}
        isActive={isActive}
        videoId={video._id}
        dubbedAudioUrl={dubbing.audioUrl}
        subtitleUrl={dubbing.subtitleUrl}
        subtitleLang={dubbing.lang}
      />

      <ActionButtons
        video={{ ...video, isLiked, likeCount }}
        onLike={handleLike}
        onComment={() => onCommentClick?.(video)}
        onShare={handleShare}
        onDubbing={() => setShowLanguages(true)}
        activeDubbingLang={dubbing.lang}
      />

      <div className="absolute bottom-0 left-0 right-16 p-4 pt-10 bg-gradient-to-t from-black/80 to-transparent pointer-events-none">
        <div className="flex items-center gap-3 mb-2 pointer-events-auto">
          <Link to={`/profile/${author.username}`}>
            <Avatar src={author.avatarUrl} username={author.username} size="md" />
          </Link>
          <Link to={`/profile/${author.username}`} className="font-bold text-lg hover:underline">
            {author.username}
          </Link>
        </div>
        <p className="text-sm mb-2">{video.title}</p>
        <p className="text-sm text-gray-300 pointer-events-auto">
          {video.hashtags?.map((tag) => (
            <Link key={tag} to={`/search?q=%23${tag}`} className="font-semibold hover:underline mr-2">
              #{tag}
            </Link>
          ))}
        </p>
      </div>

      <LanguageSelector
        videoId={video._id}
        isOpen={showLanguages}
        onClose={() => setShowLanguages(false)}
        onSelect={({ lang, audioUrl, subtitleUrl }) =>
          setDubbing({ lang, audioUrl: audioUrl || null, subtitleUrl: subtitleUrl || null })
        }
      />
    </motion.div>
  );
}
