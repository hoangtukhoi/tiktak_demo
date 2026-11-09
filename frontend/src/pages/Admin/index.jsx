import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { BadgeCheck } from 'lucide-react';
import Avatar from '../../components/common/Avatar';
import * as adminApi from '../../api/admin.api';
import { errMsg } from '../../api/axiosClient';
import { formatCount, timeAgo } from '../../utils/format';

const TABS = [['users', 'Người dùng'], ['videos', 'Video'], ['flagged', 'Chờ duyệt'], ['logs', 'Nhật ký']];
const MOD = { pending: 'Đang quét', flagged: 'Chờ duyệt', removed: 'Đã gỡ' };

function StatCard({ label, value, tone = '' }) {
  return (
    <div className="card p-4">
      <p className="text-sm text-fg-muted">{label}</p>
      <p className={`tabular mt-1 text-2xl font-bold ${tone}`}>{value ?? '—'}</p>
    </div>
  );
}

const Row = ({ children }) => <tr className="border-b border-line transition hover:bg-surface-2/70">{children}</tr>;
const Th = ({ children, className = '' }) => <th className={`px-3 py-2.5 text-left text-xs font-semibold text-fg-muted ${className}`}>{children}</th>;
const Td = ({ children, className = '' }) => <td className={`px-3 py-3 align-middle ${className}`}>{children}</td>;
const Act = ({ danger, ...p }) => <button className={`btn-sm btn ${danger ? 'text-danger hover:bg-danger/10' : 'hover:bg-surface-2'}`} {...p} />;

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
      <thead><tr className="border-b border-line"><Th>Video</Th><Th>Tác giả</Th><Th>Trạng thái</Th><Th className="text-right">Lượt xem</Th><Th /></tr></thead>
      <tbody>
        {list.map((v) => (
          <Row key={v._id}>
            <Td>
              <Link to={`/watch/${v._id}`} className="flex items-center gap-3 hover:text-brand-text">
                {v.thumbnailUrl ? <img src={v.thumbnailUrl} alt="" className="h-12 w-9 rounded-sm object-cover" /> : <span className="h-12 w-9 rounded-sm bg-surface-3" />}
                <span className="line-clamp-2 max-w-[260px] font-semibold">{v.title}</span>
              </Link>
            </Td>
            <Td className="text-fg-muted">{v.author.username}</Td>
            <Td>
              <span className="text-xs text-fg-muted">{v.status}</span>
              {v.moderationStatus && v.moderationStatus !== 'approved' && <span className="ml-2 rounded-sm bg-danger/10 px-1.5 py-0.5 text-2xs font-semibold text-danger">{MOD[v.moderationStatus] || v.moderationStatus}</span>}
              {v.flagReason && <span className="block text-xs text-fg-subtle">{v.flagReason}</span>}
            </Td>
            <Td className="tabular text-right">{formatCount(v.viewCount)}</Td>
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
    <div className="mx-auto max-w-[1200px] px-4 pb-16 pt-6 lg:px-8 lg:pt-10">
      <h1 className="hidden text-2xl font-bold lg:block">Quản trị</h1>

      <div className="grid grid-cols-2 gap-3 lg:mt-6 lg:grid-cols-4">
        <StatCard label="Người dùng" value={stats && formatCount(stats.users ?? 0)} />
        <StatCard label="Video" value={stats && formatCount(stats.videos ?? 0)} />
        <StatCard label="Chờ duyệt" value={data.flagged ? data.flagged.length : '—'} tone={data.flagged?.length ? 'text-warn' : ''} />
        <StatCard label="Tài khoản bị khoá" value={data.users ? data.users.filter((u) => u.bannedAt).length : '—'} />
      </div>

      <nav className="no-scrollbar mt-8 flex gap-6 overflow-x-auto border-b border-line" role="tablist">
        {TABS.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`tab shrink-0 ${tab === k ? 'tab-active' : ''}`}>
            {label}{k === 'flagged' && data.flagged?.length > 0 && <span className="tabular ml-1.5 rounded-full bg-warn/15 px-1.5 text-2xs text-warn">{data.flagged.length}</span>}
          </button>
        ))}
      </nav>

      <div className="mt-4 overflow-x-auto">
        {rows == null ? (
          <div className="space-y-2">{[0, 1, 2, 3, 4].map((i) => <span key={i} className="skeleton block h-12 rounded" />)}</div>
        ) : !rows.length ? (
          <p className="px-6 py-14 text-center text-fg-muted">Không có dữ liệu.</p>
        ) : tab === 'users' ? (
          <table className="w-full min-w-[720px] text-sm">
            <thead><tr className="border-b border-line"><Th>Người dùng</Th><Th>Vai trò</Th><Th className="text-right">Follower</Th><Th>Trạng thái</Th><Th /></tr></thead>
            <tbody>
              {rows.map((u) => (
                <Row key={u._id}>
                  <Td>
                    <Link to={`/profile/${u.username}`} className="flex items-center gap-3 hover:text-brand-text">
                      <Avatar user={u} size={34} />
                      <span><span className="flex items-center gap-1 font-semibold">{u.username}{u.isVerified && <BadgeCheck size={14} className="text-brand-text" />}</span><span className="text-xs text-fg-muted">{u.email}</span></span>
                    </Link>
                  </Td>
                  <Td className="text-fg-muted">{u.role === 'admin' ? 'Quản trị' : 'Người dùng'}</Td>
                  <Td className="tabular text-right">{formatCount(u.followerCount || 0)}</Td>
                  <Td>{u.bannedAt ? <span className="inline-flex items-center gap-1.5 text-sm text-danger"><span className="h-1.5 w-1.5 rounded-full bg-danger" />Bị khoá · {timeAgo(u.bannedAt)}</span> : <span className="inline-flex items-center gap-1.5 text-sm text-fg-muted"><span className="h-1.5 w-1.5 rounded-full bg-success" />Hoạt động</span>}</Td>
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
          <ul className="divide-y divide-line text-sm">
            {rows.map((l, i) => <li key={l._id || i} className="flex justify-between gap-4 px-3 py-3"><span>{l.action || l.message || JSON.stringify(l)}</span><span className="text-fg-subtle">{timeAgo(l.createdAt)}</span></li>)}
          </ul>
        ) : videoTable(rows)}
      </div>
    </div>
  );
}
