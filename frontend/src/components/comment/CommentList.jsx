import { useEffect, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import CommentItem from './CommentItem';
import CommentInput from './CommentInput';
import useAuth from '../../hooks/useAuth';
import { createComment, deleteComment, getComments } from '../../api/video.api';
import { errMsg } from '../../api/axiosClient';

export default function CommentList({ videoId, videoOwnerId, allowComment = true, policy, onCountChange }) {
  const { user, isAuthenticated, isAdmin, requireAuth } = useAuth();
  const [comments, setComments] = useState(null);
  const [replyTo, setReplyTo] = useState(null);
  // Tác giả giới hạn ai được bình luận (quyền riêng tư). Feed chưa biết trước → biết khi server từ chối.
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
      const withUser = { ...c, user: typeof c.userId === 'object' ? c.user : user, createdAt: c.createdAt || new Date().toISOString() };
      const visible = c.moderationStatus === 'approved';
      if (replyTo) {
        if (visible) setComments((cs) => cs.map((x) => (x._id === replyTo._id ? { ...x, replyCount: x.replyCount + 1 } : x)));
        setReplyTo(null);
      } else setComments((cs) => [withUser, ...(cs || [])]);
      if (visible) onCountChange?.(1);
      // Bộ kiểm duyệt tự động giữ lại bình luận → báo cho người viết biết
      if (c.moderationStatus === 'pending') toast('Bình luận đang chờ duyệt — chỉ bạn thấy cho tới khi được duyệt', { icon: '⏳', duration: 4000 });
      if (c.moderationStatus === 'rejected') toast.error('Bình luận có thể vi phạm tiêu chuẩn cộng đồng nên đã bị ẩn');
    } catch (e) {
      if (e.response?.status === 403) setDenied(errMsg(e));
      toast.error(errMsg(e, 'Không gửi được bình luận'));
      throw e;
    }
  };

  // Tác giả, chủ video và admin được xoá bình luận
  const canDelete = (c) => Boolean(user && (c.user?._id === user._id || videoOwnerId === user._id || isAdmin));

  const remove = async (c, { isReply = false } = {}) => {
    if (!isReply) setComments((cs) => cs.filter((x) => x._id !== c._id));
    // Bình luận chờ duyệt / bị ẩn chưa từng được tính vào tổng
    if (c.moderationStatus === 'approved') onCountChange?.(-1);
    try { await deleteComment(c._id); } catch (e) { toast.error(errMsg(e)); }
  };

  return (
    <div className="flex h-full min-h-[40dvh] flex-col">
      <div className="min-h-0 flex-1">
        {comments === null ? (
          <ul className="space-y-4 py-3">
            {[0, 1, 2, 3].map((i) => (
              <li key={i} className="flex gap-3"><span className="skeleton h-9 w-9 rounded-full" /><span className="flex-1 space-y-2"><span className="skeleton block h-3 w-24 rounded" /><span className="skeleton block h-3 w-4/5 rounded" /></span></li>
            ))}
          </ul>
        ) : comments.length ? (
          <ul className="divide-y divide-ink-700">
            <AnimatePresence initial={false}>
              {comments.map((c) => (
                <CommentItem key={c._id} comment={c} canDelete={canDelete(c)} canDeleteReply={canDelete} onDelete={remove} onReply={setReplyTo} requireAuth={requireAuth} />
              ))}
            </AnimatePresence>
          </ul>
        ) : (
          <div className="grid h-full min-h-[30dvh] place-items-center text-center">
            <div>
              <p className="text-4xl">💬</p>
              <p className="mt-2 font-bold">Chưa có bình luận</p>
              <p className="text-sm text-paper-dim">Mở màn đi, người đầu tiên luôn được nhớ.</p>
            </div>
          </div>
        )}
      </div>
      <div className="sticky bottom-0 pb-1">
        {allowComment && denied ? (
          <p className="flex items-center justify-center gap-2 border-t border-ink-600 py-4 text-center text-sm text-paper-dim">🔒 {denied}</p>
        ) : allowComment ? (
          <CommentInput user={user} disabled={!isAuthenticated} onSubmit={submit} replyTo={replyTo} onCancelReply={() => setReplyTo(null)} />
        ) : (
          <p className="border-t border-ink-600 py-4 text-center text-sm text-paper-dim">Tác giả đã tắt bình luận cho video này.</p>
        )}
      </div>
    </div>
  );
}
