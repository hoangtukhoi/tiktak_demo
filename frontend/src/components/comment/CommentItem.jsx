import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Heart, Trash2 } from 'lucide-react';
import Avatar from '../common/Avatar';
import { getReplies, likeComment } from '../../api/video.api';
import { formatCount, timeAgo } from '../../utils/format';

export default function CommentItem({ comment, meId, onDelete, onReply, requireAuth, depth = 0 }) {
  const [liked, setLiked] = useState(comment.isLiked);
  const [count, setCount] = useState(comment.likeCount);
  const [replies, setReplies] = useState(null);

  // Có trả lời mới (replyCount tăng) khi danh sách đang mở -> tải lại
  useEffect(() => { if (replies) getReplies(comment._id).then(setReplies).catch(() => {}); }, [comment.replyCount]); // eslint-disable-line react-hooks/exhaustive-deps

  const like = async () => {
    if (!requireAuth('Đăng nhập để thích bình luận')) return;
    setLiked((l) => !l); setCount((c) => c + (liked ? -1 : 1));
    try { const r = await likeComment(comment._id); if (r) { setLiked(r.isLiked); setCount(r.likeCount); } }
    catch { setLiked(liked); setCount(comment.likeCount); }
  };

  const size = depth ? 28 : 36;
  return (
    <motion.li layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="group flex gap-3 py-3">
      <Link to={`/profile/${comment.user.username}`}><Avatar user={comment.user} size={size} /></Link>
      <div className="min-w-0 flex-1">
        <Link to={`/profile/${comment.user.username}`} className="text-sm font-semibold text-fg-muted hover:text-fg">{comment.user.username}</Link>
        <p className="whitespace-pre-wrap break-words text-base leading-snug">{comment.text}</p>
        <div className="mt-1 flex items-center gap-4 text-xs text-fg-muted">
          <span>{timeAgo(comment.createdAt)}</span>
          {!depth && <button onClick={() => onReply(comment)} className="font-semibold hover:text-fg">Trả lời</button>}
          {meId && comment.user?._id === meId && (
            <button onClick={() => onDelete(comment)} className="inline-flex items-center gap-1 opacity-0 transition hover:text-danger focus:opacity-100 group-hover:opacity-100"><Trash2 size={13} /> Xoá</button>
          )}
        </div>
        {!depth && comment.replyCount > 0 && !replies && (
          <button onClick={() => getReplies(comment._id).then(setReplies).catch(() => setReplies([]))} className="mt-2 flex items-center gap-2 text-xs font-semibold text-fg-muted hover:text-fg">
            <span className="h-px w-6 bg-line" /> Xem {comment.replyCount} câu trả lời
          </button>
        )}
        {replies?.length > 0 && (
          <ul>{replies.map((r) => <CommentItem key={r._id} comment={r} meId={meId} onDelete={onDelete} onReply={onReply} requireAuth={requireAuth} depth={1} />)}</ul>
        )}
      </div>
      <button onClick={like} aria-label="Thích bình luận" aria-pressed={liked}
        className={`flex w-8 flex-col items-center gap-0.5 pt-1 ${liked ? 'text-[#FF3B4E]' : 'text-fg-subtle hover:text-fg'}`}>
        <Heart size={17} fill={liked ? 'currentColor' : 'none'} strokeWidth={liked ? 0 : 1.75} />
        <span className="tabular text-2xs">{formatCount(count)}</span>
      </button>
    </motion.li>
  );
}
