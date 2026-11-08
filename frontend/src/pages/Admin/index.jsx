import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { BadgeCheck, Check, EyeOff, Flag } from 'lucide-react';
import Avatar from '../../components/common/Avatar';
import AdminAnalytics from '../../components/analytics/AdminAnalytics';
import * as adminApi from '../../api/admin.api';
import { errMsg } from '../../api/axiosClient';
import { formatCount, timeAgo } from '../../utils/format';
import { REPORT_REASON_LABEL } from '../../utils/constants';

const TABS = [['analytics', 'Phân tích'], ['reports', 'Báo cáo'], ['comments', 'Bình luận'], ['users', 'Người dùng'], ['videos', 'Video'], ['logs', 'Nhật ký']];

const COMMENT_FILTERS = [['pending', 'Chờ duyệt'], ['rejected', 'Đã ẩn'], ['approved', 'Đã duyệt']];

const LOG_LABEL = {
  ban_user: 'Khoá tài khoản', unban_user: 'Mở khoá tài khoản', verify_user: 'Xác minh tài khoản',
  remove_video: 'Gỡ video', approve_video: 'Duyệt video', flag_video: 'Gắn cờ video',
  approve_comment: 'Duyệt bình luận', reject_comment: 'Ẩn bình luận',
};

/** Thanh điểm vi phạm 0–1 do model / bộ lọc chấm */
function ScoreBar({ score, source }) {
  if (score == null) return <span className="font-mono text-[11px] text-paper-mute">—</span>;
  const pct = Math.round(score * 100);
  const tone = score >= 0.85 ? 'bg-coral' : score >= 0.5 ? 'bg-[#ffb020]' : 'bg-lime';
  return (
    <span className="inline-flex items-center gap-2" title={`Nguồn: ${source === 'model' ? 'model AI' : source === 'keyword' ? 'bộ lọc từ khoá' : source}`}>
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-ink-600"><span className={`block h-full ${tone}`} style={{ width: `${pct}%` }} /></span>
      <span className="font-mono text-xs font-bold">{pct}%</span>
      <span className="font-mono text-[10px] uppercase text-paper-mute">{source === 'model' ? 'AI' : source === 'keyword' ? 'từ khoá' : source}</span>
    </span>
  );
}

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
  const [tab, setTab] = useState('analytics');
  const [stats, setStats] = useState(null);
  const [data, setData] = useState({});

  const [commentFilter, setCommentFilter] = useState('pending');
  const loadStats = () => adminApi.getStats().then(setStats).catch((e) => toast.error(errMsg(e)));

  useEffect(() => { loadStats(); }, []);

  useEffect(() => {
    if (tab === 'analytics') return; // tab Phân tích tự tải dữ liệu riêng
    const load = {
      users: adminApi.getUsers,
      videos: adminApi.getAdminVideos,
      reports: () => adminApi.getReports('open'),
      comments: () => adminApi.getModerationComments(commentFilter),
      logs: adminApi.getAuditLogs,
    }[tab];
    let alive = true;
    setData((d) => ({ ...d, [tab]: tab === 'comments' ? null : d[tab] ?? null }));
    load()
      .then((r) => alive && setData((d) => ({ ...d, [tab]: r || [] })))
      .catch((e) => { if (alive) { setData((d) => ({ ...d, [tab]: [] })); toast.error(errMsg(e)); } });
    return () => { alive = false; };
  }, [tab, commentFilter]);

  const reviewComment = async (c, kind) => {
    try {
      await (kind === 'approve' ? adminApi.approveComment(c._id) : adminApi.rejectComment(c._id));
      setData((d) => ({ ...d, comments: d.comments.filter((x) => x._id !== c._id) }));
      toast(kind === 'approve' ? 'Đã duyệt — bình luận hiện công khai' : 'Đã ẩn bình luận');
      loadStats();
    } catch (e) { toast.error(errMsg(e)); }
  };

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
        reports: d.reports?.filter((x) => x._id !== v._id),
      }));
      toast(kind === 'remove' ? 'Đã gỡ video' : v.openReports ? 'Đã giữ video, đóng các báo cáo' : 'Đã duyệt video');
      loadStats();
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
              <Link to={`/admin/videos/${v._id}/analytics`} className="rounded-full px-3 py-1 text-xs font-bold transition hover:bg-ink-600">Phân tích</Link>
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
        <StatCard i={2} label="Báo cáo chờ xử lý" value={stats && formatCount(stats.pendingReports ?? 0)} />
        <StatCard i={3} label="Bình luận chờ duyệt" value={stats && formatCount(stats.pendingComments ?? 0)} />
      </div>

      <div className="mb-5 flex gap-1 overflow-x-auto rounded-full bg-ink-800 p-1 sm:w-max">
        {TABS.map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className="relative shrink-0 rounded-full px-5 py-2 text-sm font-bold">
            <span className={`absolute inset-0 rounded-full bg-paper transition-opacity duration-200 ${tab === k ? 'opacity-100' : 'opacity-0'}`} />
            <span className={`relative flex items-center gap-1.5 ${tab === k ? 'text-ink' : 'text-paper-dim'}`}>
              {label}
              {k === 'reports' && stats?.pendingReports > 0 && <span className="rounded-full bg-coral px-1.5 font-mono text-[10px] leading-4 text-white">{stats.pendingReports}</span>}
              {k === 'comments' && stats?.pendingComments > 0 && <span className="rounded-full bg-coral px-1.5 font-mono text-[10px] leading-4 text-white">{stats.pendingComments}</span>}
            </span>
          </button>
        ))}
      </div>

      {tab === 'comments' && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {COMMENT_FILTERS.map(([k, label]) => (
            <button key={k} onClick={() => setCommentFilter(k)} className={`chip ${commentFilter === k ? '!border-lime !bg-lime !text-ink' : ''}`}>{label}</button>
          ))}
          <span className="ml-auto text-xs text-paper-mute">Điểm = khả năng vi phạm do model AI (hoặc bộ lọc từ khoá khi AI chưa chạy) chấm</span>
        </div>
      )}

      {tab === 'analytics' ? <AdminAnalytics /> : (
      <div className="card overflow-x-auto p-2">
        {rows == null ? (
          <div className="space-y-2 p-2">{[0, 1, 2, 3, 4].map((i) => <span key={i} className="skeleton block h-12 rounded-xl" />)}</div>
        ) : !rows.length ? (
          <p className="px-6 py-14 text-center text-paper-dim">
            {tab === 'reports' ? 'Không có báo cáo nào cần xử lý 🎉' : tab === 'comments' ? (commentFilter === 'pending' ? 'Không có bình luận nào chờ duyệt 🎉' : 'Không có bình luận.') : 'Không có dữ liệu.'}
          </p>
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
        ) : tab === 'reports' ? (
          <ul className="divide-y divide-ink-700">
            {rows.map((v) => (
              <li key={v._id} className="flex flex-col gap-4 p-3 sm:flex-row">
                <Link to={`/watch/${v._id}`} className="shrink-0">
                  {v.thumbnailUrl ? <img src={v.thumbnailUrl} alt="" className="h-28 w-20 rounded-xl object-cover" /> : <span className="block h-28 w-20 rounded-xl bg-ink-600" />}
                </Link>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link to={`/watch/${v._id}`} className="line-clamp-1 font-bold hover:text-lime">{v.title}</Link>
                    <span className="font-mono text-xs text-paper-mute">@{v.author.username}</span>
                    {v.moderationStatus === 'flagged' && <span className="rounded-full bg-coral/15 px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-coral">Đã gắn cờ</span>}
                  </div>
                  <p className="mt-1 flex items-center gap-1.5 text-sm"><Flag size={14} className="text-coral" /><b>{v.openReports}</b> báo cáo · gần nhất {timeAgo(v.lastReportedAt)}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {Object.entries(v.reasonCounts || {}).sort((a, b) => b[1] - a[1]).map(([r, n]) => (
                      <span key={r} className="rounded-full bg-ink-700 px-2.5 py-1 text-xs font-semibold">{REPORT_REASON_LABEL[r] || r} <b className="font-mono">×{n}</b></span>
                    ))}
                  </div>
                  {v.reports.some((r) => r.note) && (
                    <ul className="mt-2 space-y-1 text-sm text-paper-dim">
                      {v.reports.filter((r) => r.note).map((r) => (
                        <li key={r._id} className="line-clamp-2">“{r.note}” <span className="font-mono text-[11px] text-paper-mute">— @{r.reporterId?.username || 'ẩn danh'}</span></li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="flex shrink-0 items-start gap-1 sm:flex-col sm:items-end">
                  <Act onClick={() => videoAction(v, 'approve')}>Giữ video</Act>
                  <Act danger onClick={() => videoAction(v, 'remove')}>Gỡ video</Act>
                  <Link to={`/admin/videos/${v._id}/analytics`} className="rounded-full px-3 py-1 text-xs font-bold transition hover:bg-ink-600">Phân tích</Link>
                </div>
              </li>
            ))}
          </ul>
        ) : tab === 'comments' ? (
          <table className="w-full min-w-[760px] text-sm">
            <thead><tr className="border-b border-ink-600"><Th>Bình luận</Th><Th>Video</Th><Th>Điểm vi phạm</Th><Th /></tr></thead>
            <tbody>
              {rows.map((c) => (
                <Row key={c._id}>
                  <Td className="max-w-[360px]">
                    <Link to={`/profile/${c.userId?.username}`} className="flex items-center gap-2 font-bold hover:text-lime">
                      <Avatar user={c.userId} size={24} /> @{c.userId?.username}
                      {c.userId?.bannedAt && <span className="rounded-full bg-coral/15 px-1.5 font-mono text-[10px] text-coral">Đã khoá</span>}
                    </Link>
                    <p className="mt-1 whitespace-pre-wrap break-words">{c.content}</p>
                    <span className="font-mono text-[11px] text-paper-mute">{timeAgo(c.createdAt)}{c.moderation?.reviewedBy && ` · xử lý bởi @${c.moderation.reviewedBy.username}`}</span>
                  </Td>
                  <Td>
                    {c.videoId ? (
                      <Link to={`/watch/${c.videoId._id}`} className="flex items-center gap-2 hover:text-lime">
                        {c.videoId.thumbnailUrl ? <img src={c.videoId.thumbnailUrl} alt="" className="h-10 w-7 rounded-md object-cover" /> : <span className="h-10 w-7 rounded-md bg-ink-600" />}
                        <span className="line-clamp-2 max-w-[180px] text-xs font-semibold">{c.videoId.title}</span>
                      </Link>
                    ) : <span className="text-paper-mute">Video đã xoá</span>}
                  </Td>
                  <Td><ScoreBar score={c.moderation?.score} source={c.moderation?.source} />{c.moderation?.label && <span className="mt-1 block font-mono text-[10px] text-paper-mute">{c.moderation.label}</span>}</Td>
                  <Td className="whitespace-nowrap text-right">
                    {c.moderationStatus !== 'approved' && <Act onClick={() => reviewComment(c, 'approve')}><Check size={13} className="mr-1 inline" />Hiện</Act>}
                    {c.moderationStatus !== 'rejected' && <Act danger onClick={() => reviewComment(c, 'reject')}><EyeOff size={13} className="mr-1 inline" />Ẩn</Act>}
                  </Td>
                </Row>
              ))}
            </tbody>
          </table>
        ) : tab === 'logs' ? (
          <ul className="divide-y divide-ink-700 text-sm">
            {rows.map((l, i) => (
              <li key={l._id || i} className="flex justify-between gap-4 px-3 py-3">
                <span>
                  <b>@{l.adminId?.username || 'admin'}</b> · {LOG_LABEL[l.action] || l.action}
                  {(l.details?.username || l.details?.title || l.details?.content) && (
                    <span className="ml-1 text-paper-dim">“{String(l.details.username || l.details.title || l.details.content).slice(0, 80)}”</span>
                  )}
                </span>
                <span className="shrink-0 font-mono text-paper-mute">{timeAgo(l.createdAt)}</span>
              </li>
            ))}
          </ul>
        ) : videoTable(rows)}
      </div>
      )}
    </div>
  );
}
