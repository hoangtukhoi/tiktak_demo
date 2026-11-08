import { useState } from 'react';
import toast from 'react-hot-toast';
import { Check, Copy, Facebook, Flag, Mail, MessageCircle, Phone, Repeat2, Send, Share2 } from 'lucide-react';
import Modal from '../common/Modal';

const isMobile = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
const FB_APP_ID = import.meta.env.VITE_FACEBOOK_APP_ID;

/** Link chia sẻ ngắn: backend trả trang có ảnh/tiêu đề xem trước rồi chuyển sang /watch/:id */
export const shareUrlOf = (videoId) => `${location.origin}/s/${videoId}`;

const openPopup = (url) => window.open(url, '_blank', 'noopener,noreferrer,width=640,height=680');

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Trình duyệt chặn clipboard (VD trang http) → cách cũ
    const ta = Object.assign(document.createElement('textarea'), { value: text });
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
}

/**
 * Mỗi mục: id (gửi lên backend để thống kê), tên, màu, icon và cách chia sẻ.
 * Messenger/Zalo không có link chia sẻ công khai cho máy tính → sao chép link rồi mở ứng dụng.
 */
const TARGETS = [
  {
    id: 'messenger', name: 'Messenger', color: '#0a7cff', icon: <MessageCircle size={24} />,
    run: async ({ url }) => {
      if (isMobile()) return void (location.href = `fb-messenger://share/?link=${encodeURIComponent(url)}`);
      if (FB_APP_ID) return void openPopup(`https://www.facebook.com/dialog/send?app_id=${FB_APP_ID}&link=${encodeURIComponent(url)}&redirect_uri=${encodeURIComponent(url)}`);
      await copy(url);
      toast('Đã sao chép link — dán vào cuộc trò chuyện Messenger', { icon: '💬' });
      openPopup('https://www.messenger.com/');
    },
  },
  {
    id: 'facebook', name: 'Facebook', color: '#1877f2', icon: <Facebook size={24} />,
    run: ({ url }) => openPopup(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`),
  },
  {
    id: 'zalo', name: 'Zalo', color: '#0068ff', icon: <span className="text-[19px] font-extrabold">Z</span>,
    run: async ({ url, title }) => {
      if (isMobile() && navigator.share) return navigator.share({ title, url });
      await copy(url);
      toast('Đã sao chép link — dán vào cuộc trò chuyện Zalo', { icon: '💬' });
      openPopup('https://chat.zalo.me/');
    },
  },
  {
    id: 'x', name: 'X', color: '#000000', icon: <span className="text-[19px] font-extrabold">X</span>,
    run: ({ url, title }) => openPopup(`https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`),
  },
  {
    id: 'telegram', name: 'Telegram', color: '#229ed9', icon: <Send size={22} />,
    run: ({ url, title }) => openPopup(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`),
  },
  {
    id: 'whatsapp', name: 'WhatsApp', color: '#25d366', icon: <Phone size={22} />,
    run: ({ url, title }) => openPopup(`https://wa.me/?text=${encodeURIComponent(`${title} ${url}`)}`),
  },
  {
    id: 'email', name: 'Email', color: '#6f695f', icon: <Mail size={22} />,
    run: ({ url, title }) => void (location.href = `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(`${title}\n${url}`)}`),
  },
];

/**
 * Bảng chia sẻ video.
 * onShared(method) được gọi sau mỗi lần chia sẻ thành công (để tăng bộ đếm + ghi thống kê).
 */
export default function ShareSheet({ video, open, onClose, onShared, onReport, onRepost }) {
  const [copied, setCopied] = useState(false);
  const url = shareUrlOf(video._id);
  const title = video.title || 'Video trên TikTak';
  const isLocal = /^(localhost|127\.|192\.168\.|10\.)/.test(location.hostname);
  const canNative = typeof navigator !== 'undefined' && Boolean(navigator.share);

  const done = (method) => {
    onShared?.(method);
    onClose();
  };

  const runTarget = async (t) => {
    try {
      await t.run({ url, title });
      done(t.id);
    } catch {
      /* người dùng huỷ bảng chia sẻ của hệ thống */
    }
  };

  const copyLink = async () => {
    await copy(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
    toast('Đã sao chép liên kết', { icon: '🔗' });
    onShared?.('copy_link');
  };

  const nativeShare = async () => {
    try {
      await navigator.share({ title, url });
      done('native');
    } catch {
      /* huỷ */
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Chia sẻ">
      {onRepost && (
        <button
          onClick={onRepost}
          className={`mb-5 flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition ${video.isReposted ? 'border-lime bg-lime/10' : 'border-ink-600 hover:bg-ink-700'}`}
        >
          <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-full ${video.isReposted ? 'bg-lime text-ink' : 'bg-ink-600 text-paper'}`}>
            <Repeat2 size={22} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-bold">{video.isReposted ? 'Đã đăng lại · bấm để huỷ' : 'Đăng lại'}</span>
            <span className="block text-xs text-paper-mute">
              {video.isReposted ? 'Video đang hiện trong tab "Đăng lại" trên hồ sơ của bạn' : 'Người theo dõi bạn sẽ thấy video này kèm tên bạn'}
            </span>
          </span>
        </button>
      )}
      <div className="grid grid-cols-4 gap-x-2 gap-y-4 pt-2">
        {TARGETS.map((t) => (
          <button key={t.id} onClick={() => runTarget(t)} className="group flex flex-col items-center gap-2 text-[13px] font-semibold text-paper-dim hover:text-paper">
            <span className="grid h-14 w-14 place-items-center rounded-full text-white transition group-hover:scale-105 group-active:scale-95" style={{ background: t.color }}>
              {t.icon}
            </span>
            {t.name}
          </button>
        ))}
        {canNative && (
          <button onClick={nativeShare} className="group flex flex-col items-center gap-2 text-[13px] font-semibold text-paper-dim hover:text-paper">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-ink-600 text-paper transition group-hover:scale-105"><Share2 size={22} /></span>
            Khác
          </button>
        )}
      </div>

      <div className="mt-6 flex items-center gap-2 rounded-2xl border border-ink-600 bg-ink-900 p-1.5 pl-4">
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-paper-dim" title={url}>{url}</span>
        <button onClick={copyLink} className="btn !px-4 !py-2 text-sm">
          {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? 'Đã chép' : 'Sao chép'}
        </button>
      </div>

      {onReport && (
        <button onClick={onReport} className="mt-4 flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left font-bold text-coral transition hover:bg-coral/10">
          <Flag size={18} /> Báo cáo video
        </button>
      )}

      {isLocal && (
        <p className="mt-3 text-xs leading-relaxed text-paper-mute">
          Đang chạy trên máy cá nhân ({location.host}): người khác chưa mở được link này, và Facebook/Messenger chưa hiện được ảnh xem trước. Khi đưa web lên tên miền thật, link sẽ hoạt động đầy đủ.
        </p>
      )}
    </Modal>
  );
}
