import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Heart, Languages, MessageCircle, Share2 } from 'lucide-react';
import Avatar from '../common/Avatar';
import { formatCount } from '../../utils/format';
import { LANG_FLAGS } from '../../utils/constants';

function Count({ value }) {
  return (
    <span className="relative h-4 overflow-hidden font-mono text-[12px] font-bold">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span key={value} className="block" initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -12, opacity: 0 }} transition={{ duration: 0.22 }}>
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

function Action({ icon, label, onClick, active, children }) {
  return (
    <button onClick={onClick} aria-label={label} className="group flex flex-col items-center gap-1 text-white sm:text-paper">
      <motion.span
        whileTap={{ scale: 0.82 }}
        className={`relative grid h-12 w-12 place-items-center rounded-full bg-black/35 backdrop-blur-md transition-colors duration-300 sm:bg-ink-700 sm:group-hover:bg-ink-600 ${active ? 'text-coral' : ''}`}
      >
        {icon}
        {children}
      </motion.span>
    </button>
  );
}

export default function ActionButtons({ video, onLike, onComment, onDub, onShare, dubLang }) {
  return (
    <div className="flex flex-col items-center gap-4">
      <Link to={`/profile/${video.author.username}`} className="mb-1 transition hover:scale-105" aria-label={`Hồ sơ @${video.author.username}`}>
        <Avatar user={video.author} size={46} ring />
      </Link>

      <div className="flex flex-col items-center gap-1">
        <Action label="Thích" onClick={onLike} active={video.isLiked}
          icon={
            <motion.span key={String(video.isLiked)} initial={video.isLiked ? { scale: 0.4 } : false} animate={{ scale: 1 }} transition={{ type: 'spring', damping: 9, stiffness: 400 }}>
              <Heart size={26} fill={video.isLiked ? 'currentColor' : 'none'} strokeWidth={video.isLiked ? 0 : 2} />
            </motion.span>
          }
        />
        <Count value={formatCount(video.likeCount)} />
      </div>

      <div className="flex flex-col items-center gap-1">
        <Action label="Bình luận" onClick={onComment} icon={<MessageCircle size={25} />} />
        <Count value={formatCount(video.commentCount)} />
      </div>

      <div className="flex flex-col items-center gap-1">
        <Action label="Dịch & lồng tiếng" onClick={onDub} icon={<Languages size={24} />}>
          {dubLang && (
            <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} className="absolute -right-1 -top-1 rounded-full bg-lime px-1.5 font-mono text-[10px] font-bold leading-4 text-ink">
              {LANG_FLAGS[dubLang] || dubLang.toUpperCase()}
            </motion.span>
          )}
        </Action>
        <span className="font-mono text-[12px] font-bold">Dịch</span>
      </div>

      <div className="flex flex-col items-center gap-1">
        <Action label="Chia sẻ" onClick={onShare} icon={<Share2 size={23} />} />
        <Count value={formatCount(video.shareCount)} />
      </div>

      <span className="mt-1 grid h-11 w-11 animate-disc place-items-center rounded-full bg-[conic-gradient(#1c1a17,#34312b,#1c1a17,#34312b,#1c1a17)] ring-[6px] ring-black/40 sm:ring-ink-700">
        <Avatar user={video.author} size={22} />
      </span>
    </div>
  );
}
