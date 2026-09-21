import { useState } from 'react';
import { Heart, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';

import Avatar from '../common/Avatar';
import CommentInput from './CommentInput';
import { timeAgo } from '../../utils/format';
import { likeComment, getReplies } from '../../api/comment.api';
import useAuthStore from '../../store/slices/authSlice';

export default function CommentItem({ comment, onReply, onDelete, isReply = false }) {
  const [liked, setLiked] = useState(comment.isLiked || false);
  const [likeCount, setLikeCount] = useState(comment.likeCount || 0);
  const [replies, setReplies] = useState([]);
  const [showReplies, setShowReplies] = useState(false);
  const [showReplyInput, setShowReplyInput] = useState(false);

  const user = useAuthStore((s) => s.user);
  const author = comment.userId || {};
  const canDelete = user && String(user._id) === String(author._id);

  const handleLike = async () => {
    const prev = { liked, likeCount };
    setLiked(!liked);
    setLikeCount(likeCount + (liked ? -1 : 1));
    try {
      const result = await likeComment(comment._id);
      setLiked(result.isLiked);
      setLikeCount(result.likeCount);
    } catch (err) {
      setLiked(prev.liked);
      setLikeCount(prev.likeCount);
    }
  };

  const loadReplies = async () => {
    if (showReplies) return setShowReplies(false);
    const data = await getReplies(comment._id);
    setReplies(data.replies);
    setShowReplies(true);
  };

  return (
    <div className={`flex gap-3 p-3 ${isReply ? 'pl-10' : ''}`}>
      <Link to={`/profile/${author.username}`}>
        <Avatar src={author.avatarUrl} username={author.username} size="sm" />
      </Link>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 text-sm">
          <Link to={`/profile/${author.username}`} className="font-semibold hover:underline">
            {author.username}
          </Link>
          <span className="text-xs text-gray-500">{timeAgo(comment.createdAt)}</span>
        </div>

        <p className="text-sm mt-1 break-words">{comment.content}</p>

        <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
          {!isReply && (
            <button onClick={() => setShowReplyInput(!showReplyInput)} className="hover:text-white">
              Trả lời
            </button>
          )}
          {!isReply && comment.replyCount > 0 && (
            <button onClick={loadReplies} className="hover:text-white">
              {showReplies ? 'Ẩn' : `Xem ${comment.replyCount} trả lời`}
            </button>
          )}
          {canDelete && (
            <button
              onClick={() => onDelete?.(comment._id)}
              aria-label="Xoá bình luận"
              className="hover:text-red-400"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>

        {showReplyInput && (
          <CommentInput
            autoFocus
            placeholder={`Trả lời ${author.username}`}
            onSubmit={async (text) => {
              await onReply?.(text, comment._id);
              setShowReplyInput(false);
              if (showReplies) {
                const data = await getReplies(comment._id);
                setReplies(data.replies);
              }
            }}
          />
        )}

        {showReplies &&
          replies.map((r) => (
            <CommentItem key={r._id} comment={r} onDelete={onDelete} isReply />
          ))}
      </div>

      <button onClick={handleLike} aria-label="Thích bình luận" className="flex flex-col items-center gap-1">
        <Heart className={`w-4 h-4 ${liked ? 'text-red-500 fill-current' : 'text-gray-400'}`} />
        <span className="text-xs text-gray-400">{likeCount || ''}</span>
      </button>
    </div>
  );
}
