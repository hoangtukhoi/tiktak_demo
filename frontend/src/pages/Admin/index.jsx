import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { BadgeCheck } from 'lucide-react';
import Avatar from '../../components/common/Avatar';
import * as adminApi from '../../api/admin.api';
import { errMsg } from '../../api/axiosClient';
import { formatCount, timeAgo } from '../../utils/format';

const TABS = [['users', 'Người dùng'], ['videos', 'Video'], ['flagged', 'Bị báo cáo'], ['logs', 'Nhật ký']];

function StatCard({ label, value, accent, i }) {
  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
      className={`rounded-3xl p-5 ${accent ? 'bg-lime text-ink' : 'border border-ink-600 bg-ink-800'}`}>
      <p className={`label ${accent ? '!text-ink/60' : ''}`}>{label}</p>
      <p className="mt-3 font-mono text-4xl font-bold tracking-tighter">{value ?? '—'}</p>
    </motion.div>
  );
}

const Row = ({ children }) => <tr className="border-b border-ink-700 transition hover:bg-ink-800/70">{children}</tr>;
const Th = ({ children, className = '' }) => <th className={`label px-3 py-3 text-left font-bold ${className}`}>{children}</th>;
const Td = ({ children, className = '' }) => <td className={`px-3 py-3 align-middle ${className}`}>{children}</td>;
const Act = ({ danger, ...p }) => <button className={`rounded-full px-3 py-1 text-xs font-bold transition ${danger ? 'text-coral hover:bg-coral/15' : 'hover:bg-ink-600'}`} {...p} />;

export default function Admin() {
  const [tab, setTab] = useState('users');
  const [stats, setStats] = useState(null);
  const [data, setData] = useState({});

  useEffect(() => {
    adminApi.getStats().then(setStats).catch((e) => toast.error(errMsg(e)));
    adminApi.getFlaggedVideos().then((f) => setData((d) => ({ ...d, flagged: d.flagged ?? f }))).catch(() => {});
  }, []);

  useEffect(() => {
    const load = { users: adminApi.getUsers, videos: adminApi.getAdminVideos, flagged: adminApi.getFlaggedVideos, logs: adminApi.getAuditLogs }[tab];
    setData((d) => ({ ...d, [tab]: d[tab] ?? null }));
    load().then((r) => setData((d) => ({ ...d, [tab]: r || [] }))).catch((e) => { setData((d) => ({ ...d, [tab]: [] })); toast.error(errMsg(e)); });
  }, [tab]);

  const patchUser = async (fn, u, msg) => {
    try {
      const updated = await fn(u._id);
      setData((d) => ({ ...d, users: d.users.map((x) => (x._id === u._id ? { ...x, ...updated } : x)) }));
      toast(msg);
    } catch (e) { toast.error(errMsg(e)); }
  };

  const videoAction = async (v, kind) => {
    if (kind === 'remove' && !confirm(`Gỡ video “${v.title}”?`)) return;
    try {
      await (kind === 'remove' ? adminApi.removeVideo(v._id) : adminApi.approveVideo(v._id));
      setData((d) => ({
        ...d,
        videos: d.videos?.filter((x) => kind !== 'remove' || x._id !== v._id),
        flagged: d.flagged?.filter((x) => x._id !== v._id),
      }));
      toast(kind === 'remove' ? 'Đã gỡ video' : 'Đã duyệt video');
    } catch (e) { toast.error(errMsg(e)); }
  };

  const rows = data[tab];
  const videoTable = (list) => (
    <table className="w-full min-w-[720px] text-sm">
      <thead><tr className="border-b border-ink-600"><Th>Video</Th><Th>Tác giả</Th><Th>Trạng thái</Th><Th className="text-right">Lượt xem</Th><Th /></tr></thead>
      <tbody>
        {list.map((v) => (
          <Row key={v._id}>
            <Td>
              <Link to={`/watch/${v._id}`} className="flex items-center gap-3 hover:text-lime">
                {v.thumbnailUrl ? <img src={v.thumbnailUrl} alt="" className="h-12 w-9 rounded-lg object-cover" /> : <span className="h-12 w-9 rounded-lg bg-ink-600" />}
                <span className="line-clamp-2 max-w-[260px] font-semibold">{v.title}</span>
              </Link>
            </Td>
            <Td className="font-mono text-xs">@{v.author.username}</Td>
            <Td>
              <span className="font-mono text-xs">{v.status}</span>
              {v.moderationStatus && v.moderationStatus !== 'approved' && <span className="ml-2 rounded-full bg-coral/15 px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-coral">{v.moderationStatus}</span>}
              {v.flagReason && <span className="block text-xs text-paper-mute">{v.flagReason}</span>}
            </Td>
            <Td className="text-right font-mono">{formatCount(v.viewCount)}</Td>
            <Td className="whitespace-nowrap text-right">
              {v.moderationStatus !== 'approved' && <Act onClick={() => videoAction(v, 'approve')}>Duyệt</Act>}
              <Act danger onClick={() => videoAction(v, 'remove')}>Gỡ</Act>
            </Td>
          </Row>
        ))}
      </tbody>
    </table>
  );

  return (
    <div className="mx-auto max-w-[1200px] px-4 pb-16 pt-6 sm:px-8">
      <header className="mb-8">
        <p className="label">Bảng điều khiển</p>
        <h1 className="mt-2 text-4xl font-extrabold sm:text-5xl">Quản trị</h1>
      </header>

      <div className="mb-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard i={0} label="Người dùng" value={stats && formatCount(stats.users ?? 0)} accent />
        <StatCard i={1} label="Video" value={stats && formatCount(stats.videos ?? 0)} />
        <StatCard i={2} label="Bị báo cáo" value={data.flagged ? data.flagged.length : '—'} />
        <StatCard i={3} label="Bị khoá" value={data.users ? data.users.filter((u) => u.bannedAt).length : '—'} />
      </div>

      <div className="mb-5 flex gap-1 overflow-x-auto rounded-full bg-ink-800 p-1 sm:w-max">
        {TABS.map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className="relative shrink-0 rounded-full px-5 py-2 text-sm font-bold">
            {tab === k && <motion.span layoutId="admin-tab" className="absolute inset-0 rounded-full bg-paper" transition={{ type: 'spring', damping: 30, stiffness: 380 }} />}
            <span className={`relative ${tab === k ? 'text-ink' : 'text-paper-dim'}`}>{label}</span>
          </button>
        ))}
      </div>

      <div className="card overflow-x-auto p-2">
        {rows == null ? (
          <div className="space-y-2 p-2">{[0, 1, 2, 3, 4].map((i) => <span key={i} className="skeleton block h-12 rounded-xl" />)}</div>
        ) : !rows.length ? (
          <p className="px-6 py-14 text-center text-paper-dim">Không có dữ liệu.</p>
        ) : tab === 'users' ? (
          <table className="w-full min-w-[720px] text-sm">
            <thead><tr className="border-b border-ink-600"><Th>Người dùng</Th><Th>Vai trò</Th><Th className="text-right">Follower</Th><Th>Trạng thái</Th><Th /></tr></thead>
            <tbody>
              {rows.map((u) => (
                <Row key={u._id}>
                  <Td>
                    <Link to={`/profile/${u.username}`} className="flex items-center gap-3 hover:text-lime">
                      <Avatar user={u} size={34} />
                      <span><span className="flex items-center gap-1 font-bold">@{u.username}{u.isVerified && <BadgeCheck size={14} className="text-lime" />}</span><span className="font-mono text-xs text-paper-mute">{u.email}</span></span>
                    </Link>
                  </Td>
                  <Td className="font-mono text-xs uppercase">{u.role}</Td>
                  <Td className="text-right font-mono">{formatCount(u.followerCount || 0)}</Td>
                  <Td>{u.bannedAt ? <span className="rounded-full bg-coral/15 px-2.5 py-1 font-mono text-[11px] font-bold text-coral">Khoá · {timeAgo(u.bannedAt)}</span> : <span className="rounded-full bg-lime/15 px-2.5 py-1 font-mono text-[11px] font-bold text-lime">Hoạt động</span>}</Td>
                  <Td className="whitespace-nowrap text-right">
                    {!u.isVerified && <Act onClick={() => patchUser(adminApi.verifyUser, u, 'Đã xác minh')}>Xác minh</Act>}
                    {u.bannedAt
                      ? <Act onClick={() => patchUser(adminApi.unbanUser, u, 'Đã mở khoá')}>Mở khoá</Act>
                      : <Act danger onClick={() => patchUser(adminApi.banUser, u, 'Đã khoá tài khoản')}>Khoá</Act>}
                  </Td>
                </Row>
              ))}
            </tbody>
          </table>
        ) : tab === 'logs' ? (
          <ul className="divide-y divide-ink-700 font-mono text-sm">
            {rows.map((l, i) => <li key={l._id || i} className="flex justify-between gap-4 px-3 py-3"><span>{l.action || l.message || JSON.stringify(l)}</span><span className="text-paper-mute">{timeAgo(l.createdAt)}</span></li>)}
          </ul>
        ) : videoTable(rows)}
      </div>
    </div>
  );
}
