import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { Lock, MessageCircle } from 'lucide-react';
import CommentItem from './CommentItem';
import CommentInput from './CommentInput';
import ReportDialog from '../common/ReportDialog';
import useAuth from '../../hooks/useAuth';
import { createComment, deleteComment, getComments } from '../../api/video.api';
import { errMsg } from '../../api/axiosClient';

/**
 * videoOwnerId: chủ video được xoá mọi bình luận trên video của mình
 * policy: { allowed, reason } — tác giả giới hạn ai được bình luận (quyền riêng tư).
 *   Feed chưa biết trước → biết khi server từ chối (403).
 */
export default function CommentList({ videoId, videoOwnerId, allowComment = true, policy, onCountChange }) {
  const { user, isAuthenticated, isStaff, requireAuth } = useAuth();
  const [reporting, setReporting] = useState(null); // bình luận đang báo cáo
  const [comments, setComments] = useState(null);
  const [replyTo, setReplyTo] = useState(null);
  const [denied, setDenied] = useState(policy && !policy.allowed ? policy.reason : null);
  useEffect(() => setDenied(policy && !policy.allowed ? policy.reason : null), [policy, videoId]);

  useEffect(() => {
    let alive = true;
    setComments(null);
    getComments(videoId).then((c) => alive && setComments(c)).catch(() => alive && setComments([]));
    return () => { alive = false; };
  }, [videoId]);

  const submit = async (text) => {
    if (!requireAuth('Đăng nhập để bình luận')) return;
    try {
      const c = await createComment(videoId, text, replyTo?._id);
      // backend chưa populate userId -> gắn user hiện tại để hiển thị ngay
      const withUser = { ...c, user: c.user?.username ? c.user : user, createdAt: c.createdAt || new Date().toISOString() };
      const visible = c.moderationStatus === 'approved';
      if (replyTo) {
        // Trả lời đang chờ duyệt chưa được tính vào replyCount
        if (visible) setComments((cs) => cs.map((x) => (x._id === replyTo._id ? { ...x, replyCount: x.replyCount + 1 } : x)));
        setReplyTo(null);
      } else setComments((cs) => [withUser, ...(cs || [])]);
      if (visible) onCountChange?.(1);
      // Bộ kiểm duyệt tự động giữ lại bình luận → báo cho người viết biết
      if (c.moderationStatus === 'pending') toast('Bình luận đang chờ duyệt — chỉ bạn thấy cho tới khi được duyệt', { duration: 4000 });
      if (c.moderationStatus === 'rejected') toast.error('Bình luận có thể vi phạm tiêu chuẩn cộng đồng nên đã bị ẩn');
    } catch (e) {
      if (e.response?.status === 403) setDenied(errMsg(e));
      toast.error(errMsg(e, 'Không gửi được bình luận'));
      throw e;
    }
  };

  // Người viết, chủ video và admin / kiểm duyệt viên được xoá bình luận
  const canDelete = (c) => Boolean(user && (c.user?._id === user._id || videoOwnerId === user._id || isStaff));
  // Báo cáo bình luận của người khác (admin / kiểm duyệt viên đã có công cụ riêng)
  const canReport = (c) => !isStaff && c.user?._id !== user?._id;
  const report = (c) => requireAuth('Đăng nhập để báo cáo') && setReporting(c);

  const remove = async (c, { isReply = false } = {}) => {
    if (!confirm('Xoá bình luận này?')) return false;
    if (!isReply) setComments((cs) => cs.filter((x) => x._id !== c._id));
    // Bình luận chờ duyệt / bị ẩn chưa từng được tính vào tổng
    if (c.moderationStatus === 'approved') onCountChange?.(-1);
    try { await deleteComment(c._id); } catch (e) { toast.error(errMsg(e)); }
    return true;
  };

  return (
    <div className="flex h-full min-h-[50dvh] flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-5">
        {comments === null ? (
          <ul className="space-y-5 py-4">
            {[0, 1, 2, 3].map((i) => <li key={i} className="flex gap-3"><span className="skeleton h-9 w-9 rounded-full" /><span className="flex-1 space-y-2"><span className="skeleton block h-3 w-24 rounded" /><span className="skeleton block h-3 w-4/5 rounded" /></span></li>)}
          </ul>
        ) : comments.length ? (
          <ul className="divide-y divide-line">
            <AnimatePresence initial={false}>
              {comments.map((c) => (
                <CommentItem key={c._id} comment={c} canDelete={canDelete} onDelete={remove} canReport={canReport} onReport={report} onReply={setReplyTo} requireAuth={requireAuth} />
              ))}
            </AnimatePresence>
          </ul>
        ) : (
          <div className="flex flex-col items-center py-16 text-center text-fg-muted">
            <MessageCircle size={32} strokeWidth={1.5} />
            <p className="mt-3 font-semibold text-fg">Chưa có bình luận</p>
            <p className="text-sm">Hãy là người đầu tiên bình luận.</p>
          </div>
        )}
      </div>
      {!allowComment ? (
        <p className="border-t border-line px-5 py-4 text-center text-sm text-fg-muted">Tác giả đã tắt bình luận cho video này.</p>
      ) : denied ? (
        <p className="flex items-center justify-center gap-2 border-t border-line px-5 py-4 text-center text-sm text-fg-muted"><Lock size={15} /> {denied}</p>
      ) : isAuthenticated ? (
        <CommentInput onSubmit={submit} replyTo={replyTo} onCancelReply={() => setReplyTo(null)} />
      ) : (
        <div className="border-t border-line px-5 py-3">
          <Link to="/login" className="btn-secondary w-full">Đăng nhập để bình luận</Link>
        </div>
      )}
      <ReportDialog type="comment" targetId={reporting?._id} open={!!reporting} onClose={() => setReporting(null)} />
    </div>
  );
}
