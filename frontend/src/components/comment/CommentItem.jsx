import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Clock, EyeOff, Heart, Trash2 } from 'lucide-react';
import Avatar from '../common/Avatar';
import RichText from '../common/RichText';
import { getReplies, likeComment } from '../../api/video.api';
import { formatCount, timeAgo } from '../../utils/format';

/** Nhãn cho bình luận chưa hiện công khai — chỉ tác giả nhìn thấy */
export function ModerationBadge({ status }) {
  if (status === 'pending') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-paper/10 px-2 py-0.5 font-mono text-[10px] font-bold text-paper-dim" title="Chỉ bạn thấy bình luận này cho tới khi được duyệt">
        <Clock size={11} /> Đang chờ duyệt
      </span>
    );
  }
  if (status === 'rejected') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-coral/15 px-2 py-0.5 font-mono text-[10px] font-bold text-coral" title="Bình luận vi phạm tiêu chuẩn cộng đồng nên chỉ bạn nhìn thấy">
        <EyeOff size={11} /> Đã bị ẩn
      </span>
    );
  }
  return null;
}

export default function CommentItem({ comment, canDelete, canDeleteReply, onDelete, onReply, requireAuth }) {
  const [liked, setLiked] = useState(!!comment.isLiked);
  const [replies, setReplies] = useState(null);
  const hidden = comment.moderationStatus !== 'approved';
  // likeCount từ server đã gồm lượt thích của mình (nếu có) → chỉ cộng/trừ phần chênh
  const likeCount = comment.likeCount + (liked ? 1 : 0) - (comment.isLiked ? 1 : 0);

  const like = () => {
    if (!requireAuth()) return;
    setLiked((l) => !l);
    likeComment(comment._id).catch(() => setLiked((l) => !l));
  };

  const loadReplies = async () => setReplies(await getReplies(comment._id).catch(() => []));
  const removeReply = (r) => {
    setReplies((rs) => rs.filter((x) => x._id !== r._id));
    onDelete(r, { isReply: true });
  };

  return (
    <motion.li layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -20 }} className={`group flex gap-3 py-3 ${hidden ? 'opacity-70' : ''}`}>
      <Link to={`/profile/${comment.user.username}`}><Avatar user={comment.user} size={36} /></Link>
      <div className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <Link to={`/profile/${comment.user.username}`} className="text-sm font-bold text-paper-dim hover:text-paper">{comment.user.username}</Link>
          <ModerationBadge status={comment.moderationStatus} />
        </span>
        <p className="mt-0.5 whitespace-pre-wrap break-words text-[15px] leading-snug">
          <RichText text={comment.text} mentions={comment.mentions} />
        </p>
        <div className="mt-1.5 flex items-center gap-4 font-mono text-[11px] text-paper-mute">
          <span>{timeAgo(comment.createdAt)}</span>
          {!hidden && <button onClick={() => onReply(comment)} className="font-bold hover:text-paper">Trả lời</button>}
          {canDelete && (
            <button onClick={() => onDelete(comment)} className="opacity-0 transition hover:text-coral focus-visible:opacity-100 group-hover:opacity-100" aria-label="Xoá bình luận"><Trash2 size={13} /></button>
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
              <li key={r._id} className={`group/reply flex gap-2 py-2 text-sm ${r.moderationStatus !== 'approved' ? 'opacity-70' : ''}`}>
                <Link to={`/profile/${r.user.username}`}><Avatar user={r.user} size={24} /></Link>
                <span className="min-w-0 flex-1 break-words">
                  <Link to={`/profile/${r.user.username}`} className="font-bold text-paper-dim hover:text-paper">{r.user.username}</Link>{' '}
                  <RichText text={r.text} mentions={r.mentions} />
                  {r.moderationStatus !== 'approved' && <span className="ml-2 align-middle"><ModerationBadge status={r.moderationStatus} /></span>}
                </span>
                {canDeleteReply?.(r) && (
                  <button onClick={() => removeReply(r)} className="text-paper-mute opacity-0 transition hover:text-coral focus-visible:opacity-100 group-hover/reply:opacity-100" aria-label="Xoá trả lời"><Trash2 size={12} /></button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      {!hidden && (
        <button onClick={like} className={`flex flex-col items-center gap-0.5 pt-1 transition ${liked ? 'text-coral' : 'text-paper-mute hover:text-paper'}`} aria-label="Thích bình luận" aria-pressed={liked}>
          <motion.span key={String(liked)} initial={liked ? { scale: 0.5 } : false} animate={{ scale: 1 }} transition={{ type: 'spring', damping: 9, stiffness: 400 }}>
            <Heart size={16} fill={liked ? 'currentColor' : 'none'} />
          </motion.span>
          <span className="font-mono text-[10px]">{formatCount(Math.max(0, likeCount))}</span>
        </button>
      )}
    </motion.li>
  );
}
