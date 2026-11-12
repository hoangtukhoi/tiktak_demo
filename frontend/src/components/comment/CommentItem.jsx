import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Clock, EyeOff, Flag, Heart, Trash2 } from 'lucide-react';
import Avatar from '../common/Avatar';
import RichText from '../common/RichText';
import { getReplies, likeComment } from '../../api/video.api';
import { formatCount, timeAgo } from '../../utils/format';

/** Nhãn cho bình luận chưa hiện công khai — chỉ người viết nhìn thấy */
export function ModerationBadge({ status }) {
  if (status === 'pending') {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-surface-2 px-1.5 py-0.5 text-2xs font-semibold text-fg-muted" title="Chỉ bạn thấy bình luận này cho tới khi được duyệt">
        <Clock size={11} /> Đang chờ duyệt
      </span>
    );
  }
  if (status === 'rejected') {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-danger/10 px-1.5 py-0.5 text-2xs font-semibold text-danger" title="Bình luận vi phạm tiêu chuẩn cộng đồng nên chỉ bạn nhìn thấy">
        <EyeOff size={11} /> Đã bị ẩn
      </span>
    );
  }
  return null;
}

/**
 * canDelete(comment) -> bool ; onDelete(comment, { isReply }) -> Promise<bool đã xoá>
 * canReport(comment) -> bool ; onReport(comment): mở hộp thoại báo cáo
 */
export default function CommentItem({ comment, canDelete, onDelete, canReport, onReport, onReply, requireAuth, depth = 0, onRemoved }) {
  const [liked, setLiked] = useState(comment.isLiked);
  const [count, setCount] = useState(comment.likeCount);
  const [replies, setReplies] = useState(null);
  const hidden = comment.moderationStatus !== 'approved';

  // Có trả lời mới (replyCount tăng) khi danh sách đang mở -> tải lại
  useEffect(() => { if (replies) getReplies(comment._id).then(setReplies).catch(() => {}); }, [comment.replyCount]); // eslint-disable-line react-hooks/exhaustive-deps

  const like = async () => {
    if (!requireAuth('Đăng nhập để thích bình luận')) return;
    setLiked((l) => !l); setCount((c) => c + (liked ? -1 : 1));
    try { const r = await likeComment(comment._id); if (r && typeof r.isLiked === 'boolean') { setLiked(r.isLiked); setCount(r.likeCount ?? count); } }
    catch { setLiked(liked); setCount(comment.likeCount); }
  };

  const remove = async () => {
    const ok = await onDelete(comment, { isReply: depth > 0 });
    if (ok && depth) onRemoved?.(comment);
  };

  const size = depth ? 28 : 36;
  return (
    <motion.li layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className={`group flex gap-3 py-3 ${hidden ? 'opacity-75' : ''}`}>
      <Link to={`/profile/${comment.user.username}`}><Avatar user={comment.user} size={size} /></Link>
      <div className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <Link to={`/profile/${comment.user.username}`} className="text-sm font-semibold text-fg-muted hover:text-fg">{comment.user.username}</Link>
          <ModerationBadge status={comment.moderationStatus} />
        </span>
        <p className="whitespace-pre-wrap break-words text-base leading-snug"><RichText text={comment.text} mentions={comment.mentions} /></p>
        <div className="mt-1 flex items-center gap-4 text-xs text-fg-muted">
          <span>{timeAgo(comment.createdAt)}</span>
          {!depth && !hidden && <button onClick={() => onReply(comment)} className="font-semibold hover:text-fg">Trả lời</button>}
          {canDelete?.(comment) && (
            <button onClick={remove} className="inline-flex items-center gap-1 opacity-0 transition hover:text-danger focus:opacity-100 group-hover:opacity-100"><Trash2 size={13} /> Xoá</button>
          )}
          {!hidden && canReport?.(comment) && (
            // Điện thoại không có hover → luôn hiện (mờ); máy tính hiện khi rê chuột
            <button onClick={() => onReport(comment)} aria-label="Báo cáo bình luận" title="Báo cáo bình luận"
              className="inline-flex items-center gap-1 text-fg-subtle transition hover:text-danger focus:opacity-100 lg:opacity-0 lg:group-hover:opacity-100"><Flag size={13} /> <span className="hidden lg:inline">Báo cáo</span></button>
          )}
        </div>
        {!depth && comment.replyCount > 0 && !replies && (
          <button onClick={() => getReplies(comment._id).then(setReplies).catch(() => setReplies([]))} className="mt-2 flex items-center gap-2 text-xs font-semibold text-fg-muted hover:text-fg">
            <span className="h-px w-6 bg-line" /> Xem {comment.replyCount} câu trả lời
          </button>
        )}
        {replies?.length > 0 && (
          <ul>
            {replies.map((r) => (
              <CommentItem key={r._id} comment={r} canDelete={canDelete} onDelete={onDelete} canReport={canReport} onReport={onReport} onReply={onReply} requireAuth={requireAuth} depth={1}
                onRemoved={(x) => setReplies((rs) => rs.filter((y) => y._id !== x._id))} />
            ))}
          </ul>
        )}
      </div>
      {!hidden && (
        <button onClick={like} aria-label="Thích bình luận" aria-pressed={liked}
          className={`flex w-8 flex-col items-center gap-0.5 pt-1 ${liked ? 'text-[#FF3B4E]' : 'text-fg-subtle hover:text-fg'}`}>
          <Heart size={17} fill={liked ? 'currentColor' : 'none'} strokeWidth={liked ? 0 : 1.75} />
          <span className="tabular text-2xs">{formatCount(Math.max(0, count))}</span>
        </button>
      )}
    </motion.li>
  );
}
