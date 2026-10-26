import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Heart, Trash2 } from 'lucide-react';
import Avatar from '../common/Avatar';
import { getReplies, likeComment } from '../../api/video.api';
import { formatCount, timeAgo } from '../../utils/format';

export default function CommentItem({ comment, canDelete, onDelete, onReply, requireAuth }) {
  const [liked, setLiked] = useState(false);
  const [replies, setReplies] = useState(null);

  const like = () => {
    if (!requireAuth()) return;
    setLiked((l) => !l);
    likeComment(comment._id).catch(() => setLiked((l) => !l));
  };

  const loadReplies = async () => setReplies(await getReplies(comment._id).catch(() => []));

  return (
    <motion.li layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -20 }} className="group flex gap-3 py-3">
      <Link to={`/profile/${comment.user.username}`}><Avatar user={comment.user} size={36} /></Link>
      <div className="min-w-0 flex-1">
        <Link to={`/profile/${comment.user.username}`} className="text-sm font-bold text-paper-dim hover:text-paper">{comment.user.username}</Link>
        <p className="mt-0.5 whitespace-pre-wrap break-words text-[15px] leading-snug">{comment.text}</p>
        <div className="mt-1.5 flex items-center gap-4 font-mono text-[11px] text-paper-mute">
          <span>{timeAgo(comment.createdAt)}</span>
          <button onClick={() => onReply(comment)} className="font-bold hover:text-paper">Trả lời</button>
          {canDelete && (
            <button onClick={() => onDelete(comment)} className="opacity-0 transition hover:text-coral group-hover:opacity-100" aria-label="Xoá bình luận"><Trash2 size={13} /></button>
          )}
        </div>
        {comment.replyCount > 0 && !replies && (
          <button onClick={loadReplies} className="mt-2 flex items-center gap-2 font-mono text-[11px] font-bold text-paper-dim hover:text-paper">
            <span className="h-px w-6 bg-ink-500" /> Xem {comment.replyCount} trả lời
          </button>
        )}
        {replies?.length > 0 && (
          <ul className="mt-1 border-l border-ink-600 pl-3">
            {replies.map((r) => (
              <li key={r._id} className="flex gap-2 py-2 text-sm"><Avatar user={r.user} size={24} /><span><b className="text-paper-dim">{r.user.username}</b> {r.text}</span></li>
            ))}
          </ul>
        )}
      </div>
      <button onClick={like} className={`flex flex-col items-center gap-0.5 pt-1 transition ${liked ? 'text-coral' : 'text-paper-mute hover:text-paper'}`} aria-label="Thích bình luận">
        <motion.span key={String(liked)} initial={liked ? { scale: 0.5 } : false} animate={{ scale: 1 }} transition={{ type: 'spring', damping: 9, stiffness: 400 }}>
          <Heart size={16} fill={liked ? 'currentColor' : 'none'} />
        </motion.span>
        <span className="font-mono text-[10px]">{formatCount(comment.likeCount + (liked ? 1 : 0))}</span>
      </button>
    </motion.li>
  );
}
