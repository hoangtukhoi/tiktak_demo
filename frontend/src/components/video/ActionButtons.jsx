import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Bookmark, Check, Heart, Languages, MessageCircle, Plus, Share2 } from 'lucide-react';
import Avatar from '../common/Avatar';
import useAuth from '../../hooks/useAuth';
import { formatCount } from '../../utils/format';
import { LANG_FLAGS } from '../../utils/constants';

/**
 * Cột hành động. overlay=true: nằm trên video (mobile) -> icon trắng, không nền.
 * overlay=false: bên cạnh khung video (desktop) -> nút tròn theo theme.
 */
function Action({ icon, label, count, onClick, active, activeClass, overlay }) {
  return (
    <button onClick={onClick} aria-label={label} aria-pressed={active} className="group flex flex-col items-center gap-1">
      <motion.span whileTap={{ scale: 0.85 }}
        className={`grid h-12 w-12 place-items-center rounded-full transition-colors duration-150 ${overlay ? 'text-white drop-shadow-[0_1px_2px_rgba(0,0,0,.5)]' : 'bg-surface-2 text-fg group-hover:bg-surface-3'} ${active ? activeClass : ''}`}>
        {icon}
      </motion.span>
      {count !== undefined && <span className={`tabular text-xs font-semibold ${overlay ? 'text-shadow text-white' : 'text-fg-muted'}`}>{count}</span>}
    </button>
  );
}

export default function ActionButtons({ video, overlay = false, onLike, onComment, onSave, onShare, onDub, onFollow, dubLang }) {
  const { user } = useAuth();
  const fill = (on) => (on ? 'currentColor' : 'none');
  const isMe = user?._id === video.author._id;

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative mb-2">
        <Link to={`/profile/${video.author.username}`} aria-label={`Hồ sơ @${video.author.username}`}>
          <Avatar user={video.author} size={48} className={overlay ? 'rounded-full ring-2 ring-white' : ''} />
        </Link>
        {!isMe && onFollow && (
          <button onClick={onFollow} aria-label={video.author.isFollowing ? 'Bỏ theo dõi' : 'Theo dõi'}
            className={`absolute -bottom-2.5 left-1/2 grid h-6 w-6 -translate-x-1/2 place-items-center rounded-full text-white transition-colors ${video.author.isFollowing ? 'bg-white !text-brand' : 'bg-brand'}`}>
            {video.author.isFollowing ? <Check size={14} strokeWidth={3} /> : <Plus size={15} strokeWidth={3} />}
          </button>
        )}
      </div>

      <Action overlay={overlay} label="Thích" onClick={onLike} active={video.isLiked} activeClass="!text-[#FF3B4E]" count={formatCount(video.likeCount)}
        icon={<motion.span key={String(video.isLiked)} initial={video.isLiked ? { scale: 0.5 } : false} animate={{ scale: 1 }} transition={{ type: 'spring', damping: 10, stiffness: 400 }}>
          <Heart size={26} fill={fill(video.isLiked)} strokeWidth={video.isLiked ? 0 : 1.9} /></motion.span>} />
      <Action overlay={overlay} label="Bình luận" onClick={onComment} count={formatCount(video.commentCount)} icon={<MessageCircle size={25} strokeWidth={1.9} />} />
      {onSave && <Action overlay={overlay} label="Lưu video" onClick={onSave} active={video.isSaved} activeClass="!text-[#F5B800]" count={formatCount(video.saveCount)}
        icon={<Bookmark size={24} fill={fill(video.isSaved)} strokeWidth={video.isSaved ? 0 : 1.9} />} />}
      <Action overlay={overlay} label="Chia sẻ" onClick={onShare} count={formatCount(video.shareCount)} icon={<Share2 size={23} strokeWidth={1.9} />} />
      <Action overlay={overlay} label="Dịch và lồng tiếng" onClick={onDub} count={dubLang ? LANG_FLAGS[dubLang] || dubLang.toUpperCase() : 'Dịch'}
        active={!!dubLang} activeClass={overlay ? '' : '!bg-brand-soft !text-brand-text'} icon={<Languages size={23} strokeWidth={1.9} />} />
    </div>
  );
}
