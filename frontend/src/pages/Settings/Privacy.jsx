import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { ArrowLeft, AtSign, Ban, Eye, Heart, MessageCircle, Repeat2, Search, Shield, UserCheck, Users } from 'lucide-react';
import Avatar from '../../components/common/Avatar';
import useAuth from '../../hooks/useAuth';
import { getBlockedUsers, getPrivacy, unblockUser, updatePrivacy } from '../../api/user.api';
import { errMsg } from '../../api/axiosClient';
import { timeAgo } from '../../utils/format';

const EVERYONE = ['everyone', 'Mọi người'];
const FRIENDS = ['friends', 'Bạn bè'];
const ONLY_ME = ['only_me', 'Chỉ mình tôi'];

/** Các nhóm cài đặt. type "choice" = chọn 1, "toggle" = bật/tắt */
const SECTIONS = [
  {
    title: 'Ai có thể xem',
    items: [
      { key: 'followersVisibility', icon: Users, label: 'Danh sách người theo dõi', type: 'choice', options: [EVERYONE, FRIENDS, ONLY_ME] },
      { key: 'followingVisibility', icon: UserCheck, label: 'Danh sách đang theo dõi', type: 'choice', options: [EVERYONE, FRIENDS, ONLY_ME] },
      { key: 'likedVisibility', icon: Heart, label: 'Video đã thích', type: 'choice', options: [EVERYONE, ONLY_ME] },
      { key: 'repostsVisibility', icon: Repeat2, label: 'Video đã đăng lại', type: 'choice', options: [EVERYONE, FRIENDS, ONLY_ME] },
    ],
  },
  {
    title: 'Tương tác',
    items: [
      {
        key: 'commentPermission', icon: MessageCircle, label: 'Ai được bình luận video của bạn', type: 'choice',
        options: [EVERYONE, ['followers', 'Người theo dõi'], FRIENDS, ['no_one', 'Không ai']],
      },
      {
        key: 'mentionPermission', icon: AtSign, label: 'Ai được tag (@) bạn', type: 'choice',
        options: [EVERYONE, ['following', 'Người bạn theo dõi'], ['no_one', 'Không ai']],
      },
      { key: 'allowRepost', icon: Repeat2, label: 'Cho phép người khác đăng lại video của bạn', type: 'toggle' },
    ],
  },
  {
    title: 'Khám phá',
    items: [
      { key: 'discoverable', icon: Search, label: 'Hiện tài khoản trong tìm kiếm và gợi ý tag', hint: 'Tắt đi thì người khác chỉ tìm thấy bạn khi gõ đúng tên người dùng.', type: 'toggle' },
    ],
  },
];

function Choice({ value, options, onChange, disabled }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup">
      {options.map(([v, label]) => (
        <button
          key={v}
          role="radio"
          aria-checked={value === v}
          disabled={disabled}
          onClick={() => value !== v && onChange(v)}
          className={`chip ${value === v ? 'chip-active' : ''}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function Toggle({ checked, onChange, disabled, label }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-60 ${checked ? 'bg-brand' : 'bg-surface-3'}`}
    >
      <motion.span layout transition={{ type: 'spring', damping: 24, stiffness: 400 }} className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow ${checked ? 'right-0.5' : 'left-0.5'}`} />
    </button>
  );
}

export default function PrivacySettings() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [settings, setSettings] = useState(null);
  const [saving, setSaving] = useState(null);
  const [blocked, setBlocked] = useState(null);

  useEffect(() => {
    getPrivacy().then(setSettings).catch((e) => toast.error(errMsg(e)));
    getBlockedUsers().then(setBlocked).catch(() => setBlocked([]));
  }, []);

  const change = async (key, value) => {
    const prev = settings;
    setSettings((s) => ({ ...s, [key]: value }));
    setSaving(key);
    try {
      setSettings(await updatePrivacy({ [key]: value }));
      toast('Đã lưu', { icon: '🔒', id: 'privacy-saved' });
    } catch (e) {
      setSettings(prev);
      toast.error(errMsg(e));
    }
    setSaving(null);
  };

  const unblock = async (u) => {
    try {
      await unblockUser(u.username);
      setBlocked((list) => list.filter((x) => x._id !== u._id));
      toast(`Đã bỏ chặn @${u.username}`);
    } catch (e) { toast.error(errMsg(e)); }
  };

  return (
    <div className="mx-auto max-w-[720px] px-4 pb-16 pt-6 lg:px-8 lg:pt-10">
      <header className="mb-6 hidden items-center gap-3 lg:flex">
        <button onClick={() => (history.length > 1 ? navigate(-1) : navigate(`/profile/${user?.username}`))} className="icon-btn" aria-label="Quay lại"><ArrowLeft size={20} /></button>
        <Shield size={22} className="text-brand-text" />
        <h1 className="text-2xl font-bold">Quyền riêng tư</h1>
      </header>

      {SECTIONS.map((sec) => (
        <section key={sec.title} className="mb-7">
          <h2 className="mb-2 text-sm font-semibold text-fg-muted">{sec.title}</h2>
          <div className="card divide-y divide-line">
            {sec.items.map(({ key, icon: Icon, label, hint, type, options }) => (
              <div key={key} className={`flex gap-4 p-4 sm:p-5 ${type === 'toggle' ? 'items-center' : 'flex-col sm:flex-row sm:items-center'}`}>
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <Icon size={20} className="mt-0.5 shrink-0 text-fg-muted" />
                  <div className="min-w-0">
                    <p className="font-semibold">{label}</p>
                    {hint && <p className="mt-0.5 text-sm text-fg-subtle">{hint}</p>}
                  </div>
                </div>
                {settings === null ? (
                  <span className="skeleton h-8 w-48 rounded" />
                ) : type === 'toggle' ? (
                  <Toggle label={label} checked={settings[key]} disabled={saving === key} onChange={(v) => change(key, v)} />
                ) : (
                  <Choice value={settings[key]} options={options} disabled={saving === key} onChange={(v) => change(key, v)} />
                )}
              </div>
            ))}
          </div>
        </section>
      ))}

      <p className="-mt-4 mb-8 flex items-start gap-2 text-sm text-fg-subtle">
        <Eye size={16} className="mt-0.5 shrink-0" />
        "Bạn bè" là những người bạn theo dõi và họ cũng theo dõi bạn. Mục bị ẩn vẫn hiện con số, nhưng người khác không mở xem được.
      </p>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-fg-muted">Tài khoản đã chặn {blocked?.length ? `· ${blocked.length}` : ''}</h2>
        <div className="card">
          {blocked === null ? (
            <div className="p-5"><span className="skeleton block h-10 rounded" /></div>
          ) : !blocked.length ? (
            <p className="flex items-center gap-2 p-5 text-sm text-fg-muted"><Ban size={16} /> Bạn chưa chặn ai. Chặn một người từ nút “⋯” trên hồ sơ của họ.</p>
          ) : (
            <ul className="divide-y divide-line">
              {blocked.map((u) => (
                <li key={u._id} className="flex items-center gap-3 p-4">
                  <Link to={`/profile/${u.username}`} className="flex min-w-0 flex-1 items-center gap-3">
                    <Avatar user={u} size={40} />
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{u.displayName || u.username}</span>
                      <span className="block truncate tabular text-[11px] text-fg-subtle">@{u.username} · chặn {timeAgo(u.blockedAt)}</span>
                    </span>
                  </Link>
                  <button onClick={() => unblock(u)} className="btn-secondary btn-sm">Bỏ chặn</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
