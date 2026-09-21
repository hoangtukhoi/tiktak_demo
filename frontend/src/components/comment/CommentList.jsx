import { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';

import CommentItem from './CommentItem';
import CommentInput from './CommentInput';
import Spinner from '../common/Spinner';
import { getComments, createComment, deleteComment } from '../../api/comment.api';

export default function CommentList({ videoId }) {
  const [comments, setComments] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async (nextCursor = null, replace = false) => {
      setLoading(true);
      try {
        const data = await getComments(videoId, nextCursor);
        setComments((prev) => (replace ? data.comments : [...prev, ...data.comments]));
        setCursor(data.nextCursor);
        setHasMore(data.hasMore);
      } catch (err) {
        toast.error('Không tải được bình luận');
      } finally {
        setLoading(false);
      }
    },
    [videoId]
  );

  useEffect(() => {
    if (videoId) load(null, true);
  }, [videoId, load]);

  const handleCreate = async (content, parentId = null) => {
    try {
      const comment = await createComment(videoId, content, parentId);
      if (!parentId) setComments((prev) => [comment, ...prev]);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Không gửi được bình luận');
    }
  };

  const handleDelete = async (id) => {
    try {
      await deleteComment(id);
      setComments((prev) => prev.filter((c) => c._id !== id));
      toast.success('Đã xoá bình luận');
    } catch (err) {
      toast.error('Không xoá được bình luận');
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto divide-y divide-white/5">
        {comments.map((c) => (
          <CommentItem key={c._id} comment={c} onReply={handleCreate} onDelete={handleDelete} />
        ))}

        {loading && (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        )}

        {!loading && !comments.length && (
          <p className="text-center text-gray-400 py-8 text-sm">Chưa có bình luận nào</p>
        )}

        {hasMore && !loading && (
          <button
            onClick={() => load(cursor)}
            className="w-full py-3 text-sm text-gray-400 hover:text-white"
          >
            Xem thêm
          </button>
        )}
      </div>

      <CommentInput onSubmit={(text) => handleCreate(text)} />
    </div>
  );
}
