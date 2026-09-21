import { Heart, MessageCircle, Share2, Languages } from 'lucide-react';
import { formatCount } from '../../utils/format';

const ActionButton = ({ onClick, label, children, highlight = false }) => (
  <button onClick={onClick} aria-label={label} className="flex flex-col items-center group">
    <div
      className={`p-3 rounded-full transition ${highlight ? 'bg-brand-from/80' : 'bg-black/40 group-hover:bg-black/60'}`}
    >
      {children}
    </div>
  </button>
);

export default function ActionButtons({
  video,
  onLike,
  onComment,
  onShare,
  onDubbing,
  activeDubbingLang = null,
}) {
  return (
    <div className="absolute right-4 bottom-20 flex flex-col gap-6 items-center">
      <div className="flex flex-col items-center">
        <ActionButton onClick={onLike} label="Thích">
          <Heart className={`w-7 h-7 ${video.isLiked ? 'text-red-500 fill-current' : 'text-white'}`} />
        </ActionButton>
        <span className="text-sm font-semibold mt-1">{formatCount(video.likeCount || 0)}</span>
      </div>

      <div className="flex flex-col items-center">
        <ActionButton onClick={onComment} label="Bình luận">
          <MessageCircle className="w-7 h-7 text-white" />
        </ActionButton>
        <span className="text-sm font-semibold mt-1">{formatCount(video.commentCount || 0)}</span>
      </div>

      <div className="flex flex-col items-center">
        <ActionButton onClick={onDubbing} label="Ngôn ngữ" highlight={Boolean(activeDubbingLang)}>
          <Languages className="w-7 h-7 text-white" />
        </ActionButton>
        <span className="text-sm font-semibold mt-1 uppercase">
          {activeDubbingLang || 'Dịch'}
        </span>
      </div>

      <div className="flex flex-col items-center">
        <ActionButton onClick={onShare} label="Chia sẻ">
          <Share2 className="w-7 h-7 text-white" />
        </ActionButton>
        <span className="text-sm font-semibold mt-1">{formatCount(video.shareCount || 0)}</span>
      </div>
    </div>
  );
}
