import { useEffect, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import CommentItem from './CommentItem';
import CommentInput from './CommentInput';
import useAuth from '../../hooks/useAuth';
import { createComment, deleteComment, getComments } from '../../api/video.api';
import { errMsg } from '../../api/axiosClient';

export default function CommentList({ videoId, allowComment = true, onCountChange }) {
  const { user, isAuthenticated, requireAuth } = useAuth();
  const [comments, setComments] = useState(null);
  const [replyTo, setReplyTo] = useState(null);

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
      if (replyTo) {
        setComments((cs) => cs.map((x) => (x._id === replyTo._id ? { ...x, replyCount: x.replyCount + 1 } : x)));
        setReplyTo(null);
      } else setComments((cs) => [withUser, ...(cs || [])]);
      onCountChange?.(1);
    } catch (e) {
      toast.error(errMsg(e, 'Không gửi được bình luận'));
      throw e;
    }
  };

  const remove = async (c) => {
    setComments((cs) => cs.filter((x) => x._id !== c._id));
    onCountChange?.(-1);
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
                <CommentItem key={c._id} comment={c} canDelete={user && c.user?._id === user._id} onDelete={remove} onReply={setReplyTo} requireAuth={requireAuth} />
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
        {allowComment ? (
          <CommentInput user={user} disabled={!isAuthenticated} onSubmit={submit} replyTo={replyTo} onCancelReply={() => setReplyTo(null)} />
        ) : (
          <p className="border-t border-ink-600 py-4 text-center text-sm text-paper-dim">Tác giả đã tắt bình luận cho video này.</p>
        )}
      </div>
    </div>
  );
}
