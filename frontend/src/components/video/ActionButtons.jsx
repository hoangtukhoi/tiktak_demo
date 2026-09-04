import { Heart, MessageCircle, Share2, Languages } from 'lucide-react';
import { formatCount } from '../../utils/format';
export default function ActionButtons({ video, onLike, onComment, onShare, onDubbing }) {
  return (
    <div className="absolute right-4 bottom-20 flex flex-col gap-6 items-center">
      <button onClick={onLike} className="flex flex-col items-center group">
        <div className="p-3 rounded-full bg-black/40 group-hover:bg-black/60 transition"><Heart className={`w-7 h-7 ${video.isLiked ? 'text-red-500 fill-current' : 'text-white'}`} /></div>
        <span className="text-sm font-semibold mt-1">{formatCount(video.likesCount || 0)}</span>
      </button>
      <button onClick={onComment} className="flex flex-col items-center group">
        <div className="p-3 rounded-full bg-black/40 group-hover:bg-black/60 transition"><MessageCircle className="w-7 h-7 text-white" /></div>
        <span className="text-sm font-semibold mt-1">{formatCount(video.commentsCount || 0)}</span>
      </button>
      <button onClick={onDubbing} className="flex flex-col items-center group">
        <div className="p-3 rounded-full bg-black/40 group-hover:bg-black/60 transition"><Languages className="w-7 h-7 text-white" /></div>
        <span className="text-sm font-semibold mt-1">Dịch</span>
      </button>
      <button onClick={onShare} className="flex flex-col items-center group">
        <div className="p-3 rounded-full bg-black/40 group-hover:bg-black/60 transition"><Share2 className="w-7 h-7 text-white" /></div>
        <span className="text-sm font-semibold mt-1">{formatCount(video.sharesCount || 0)}</span>
      </button>
    </div>
  );
}
