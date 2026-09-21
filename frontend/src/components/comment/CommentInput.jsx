import { useState } from 'react';
import { Send } from 'lucide-react';

import Avatar from '../common/Avatar';
import useAuthStore from '../../store/slices/authSlice';

export default function CommentInput({ onSubmit, placeholder = 'Thêm bình luận...', autoFocus = false }) {
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);
  const { user, isAuthenticated } = useAuthStore();

  const handleSubmit = async (e) => {
    e.preventDefault();
    const text = content.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      await onSubmit(text);
      setContent('');
    } finally {
      setSending(false);
    }
  };

  if (!isAuthenticated) {
    return <p className="text-sm text-gray-400 p-3">Đăng nhập để bình luận</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2 p-3 border-t border-white/10">
      <Avatar src={user?.avatarUrl} username={user?.username} size="sm" />
      <input
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder={placeholder}
        maxLength={500}
        autoFocus={autoFocus}
        className="flex-1 bg-white/5 border border-white/10 rounded-full px-4 py-2 text-sm focus:outline-none focus:border-brand-from"
      />
      <button
        type="submit"
        disabled={!content.trim() || sending}
        aria-label="Gửi bình luận"
        className="p-2 rounded-full hover:bg-white/10 disabled:opacity-40"
      >
        <Send className="w-5 h-5" />
      </button>
    </form>
  );
}
