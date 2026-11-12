import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { BadgeCheck, Bot, Check, ChevronLeft, ChevronRight, EyeOff, Flag, MoreHorizontal, Search, ShieldCheck, ShieldOff, UserCog } from 'lucide-react';
import Avatar from '../../components/common/Avatar';
import Button from '../../components/common/Button';
import Menu from '../../components/common/Menu';
import Modal from '../../components/common/Modal';
import AdminAnalytics from '../../components/analytics/AdminAnalytics';
import useAuth from '../../hooks/useAuth';
import * as adminApi from '../../api/admin.api';
import { errMsg } from '../../api/axiosClient';
import { formatCount, timeAgo } from '../../utils/format';
import { REPORT_REASON_LABEL, ROLE_LABEL } from '../../utils/constants';

// adminOnly: kiểm duyệt viên không thấy tab này
const TABS = [
  { key: 'analytics', label: 'Phân tích', adminOnly: true },
  { key: 'reports', label: 'Báo cáo' },
  { key: 'flagged', label: 'Video chờ duyệt' },
  { key: 'comments', label: 'Bình luận' },
  { key: 'users', label: 'Người dùng' },
  { key: 'videos', label: 'Video' },
  { key: 'logs', label: 'Nhật ký', adminOnly: true },
];
const MOD = { pending: 'Đang quét', flagged: 'Chờ duyệt', removed: 'Đã gỡ' };
const COMMENT_FILTERS = [['pending', 'Chờ duyệt'], ['rejected', 'Đã ẩn'], ['approved', 'Đã duyệt']];
/** "Hoạt động 5 phút trước" / "Hoạt động 03/11/2026" / "Chưa hoạt động" */
const lastSeenLabel = (at) => {
  if (!at) return 'Chưa hoạt động';
  const t = timeAgo(at);
  if (t === 'Vừa xong') return 'Hoạt động vừa xong';
  return /^\d+ (phút|giờ|ngày)$/.test(t) ? `Hoạt động ${t} trước` : `Hoạt động ${t}`;
};

const USER_FILTERS = [['', 'Tất cả'], ['online', 'Đang online'], ['active', 'Không bị khoá'], ['banned', 'Bị khoá'], ['verified', 'Tích xanh'], ['role:moderator', 'Kiểm duyệt viên'], ['role:admin', 'Quản trị']];
const VIDEO_FILTERS = [['', 'Tất cả'], ['approved', 'Đang hiện'], ['flagged', 'Chờ duyệt'], ['removed', 'Đã gỡ']];
const REPORT_KINDS = [['video', 'Video', 'pendingReports'], ['comment', 'Bình luận', 'pendingCommentReports'], ['user', 'Tài khoản', 'pendingUserReports']];
const LOG_LABEL = {
  ban_user: 'Khoá tài khoản', unban_user: 'Mở khoá tài khoản', verify_user: 'Cấp tích xanh', unverify_user: 'Thu tích xanh', change_role: 'Đổi vai trò',
  remove_video: 'Gỡ video', approve_video: 'Duyệt video', flag_video: 'Gắn cờ video',
  approve_comment: 'Duyệt bình luận', reject_comment: 'Ẩn bình luận', dismiss_report: 'Bỏ qua báo cáo',
};
// Lý do gợi ý cho từng thao tác (bấm để điền nhanh)
const QUICK_REASONS = {
  ban: ['Spam / lừa đảo', 'Quấy rối người khác', 'Đăng nội dung vi phạm nhiều lần', 'Mạo danh'],
  removeVideo: ['Vi phạm bản quyền', 'Nội dung khiêu dâm', 'Bạo lực', 'Thông tin sai lệch', 'Spam'],
  hideComment: ['Ngôn từ xúc phạm', 'Quấy rối', 'Spam / quảng cáo', 'Ngôn từ thù ghét'],
};

/** Thanh điểm vi phạm 0–1 do model / bộ lọc chấm */
function ScoreBar({ score, source }) {
  if (score == null) return <span className="text-xs text-fg-subtle">—</span>;
  const pct = Math.round(score * 100);
  const tone = score >= 0.85 ? 'bg-danger' : score >= 0.5 ? 'bg-warn' : 'bg-success';
  const src = source === 'model' ? 'AI' : source === 'keyword' ? 'từ khoá' : source;
  return (
    <span className="inline-flex items-center gap-2" title={`Nguồn: ${source === 'model' ? 'model AI' : source === 'keyword' ? 'bộ lọc từ khoá' : source}`}>
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-3"><span className={`block h-full ${tone}`} style={{ width: `${pct}%` }} /></span>
      <span className="tabular text-xs font-semibold">{pct}%</span>
      <span className="text-2xs text-fg-subtle">{src}</span>
    </span>
  );
}

/** Bộ kiểm duyệt bình luận đang chạy bằng model hay bộ lọc từ khoá + 3 mức xử lý */
function ModerationBanner({ status }) {
  // if (!status) return null;
  // const pct = (v) => `${Math.round(v * 100)}%`;
  // const on = status.engine === 'model';
  // return (
  //   <div className={`mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border px-4 py-3 text-sm ${on ? 'border-success/30 bg-success/5' : 'border-warn/40 bg-warn/5'}`}>
  //     <span className="inline-flex items-center gap-2 font-semibold">
  //       <Bot size={17} className={on ? 'text-success' : 'text-warn'} />
  //       {status.engine === 'off' ? 'Kiểm duyệt tự động đang tắt' : on ? 'Đang chấm bằng model NLP' : 'Đang dùng bộ lọc từ khoá'}
  //     </span>
  //     {status.engine === 'keyword' && <span className="text-fg-muted">{status.reason} — bình luận nghi vấn chỉ vào hàng chờ, không tự ẩn.</span>}
  //     {on && (
  //       <span className="text-fg-muted">
  //         Điểm &lt; {pct(status.reviewThreshold)}: hiện ngay · {pct(status.reviewThreshold)}–{pct(status.rejectThreshold)}: chờ duyệt ·{' '}
  //         {status.mode === 'auto' ? <>≥ {pct(status.rejectThreshold)}: ẩn luôn</> : 'không tự ẩn (chế độ semi)'}
  //       </span>
  //     )}
  //   </div>
  // );
}

function StatCard({ label, value, tone = '', sub }) {
  return (
    <div className="card p-4">
      <p className="text-sm text-fg-muted">{label}</p>
      <p className={`tabular mt-1 text-2xl font-bold ${tone}`}>{value ?? '—'}</p>
      {sub && <p className="mt-0.5 text-xs text-fg-subtle">{sub}</p>}
    </div>
  );
}

/** Hộp thoại xác nhận có ô lý do (khoá tài khoản, gỡ video, ẩn bình luận) */
function ReasonDialog({ ask, onClose }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (ask) setReason(''); }, [ask]);
  const run = async () => {
    setBusy(true);
    try { await ask.run(reason.trim() || undefined); onClose(); } catch (e) { toast.error(errMsg(e)); }
    setBusy(false);
  };
  return (
    <Modal open={!!ask} onClose={onClose} title={ask?.title || ''} variant="dialog" width={460}
      footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Huỷ</Button><Button loading={busy} onClick={run} className="!bg-danger hover:!bg-danger/90">{ask?.confirm}</Button></div>}>
      {ask && (
        <div className="px-5 py-4">
          <p className="text-base">{ask.text}</p>
          <label className="mt-4 block">
            <span className="label">Lý do <span className="font-normal text-fg-muted">(không bắt buộc, {ask.reasonHint})</span></span>
            <textarea className="input min-h-[72px] resize-none" maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="VD: Spam quảng cáo" />
          </label>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {(QUICK_REASONS[ask.kind] || []).map((r) => (
              <button key={r} type="button" onClick={() => setReason(r)} className={`chip !h-7 !text-xs ${reason === r ? 'chip-active' : ''}`}>{r}</button>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}

function Pager({ page, totalPages, total, onPage }) {
  if (!total) return null;
  return (
    <div className="mt-4 flex items-center justify-between gap-3 text-sm text-fg-muted">
      <span className="tabular">{formatCount(total)} mục</span>
      {totalPages > 1 && (
        <span className="flex items-center gap-1">
          <button className="icon-btn" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Trang trước"><ChevronLeft size={18} /></button>
          <span className="tabular px-1">Trang {page} / {totalPages}</span>
          <button className="icon-btn" disabled={page >= totalPages} onClick={() => onPage(page + 1)} aria-label="Trang sau"><ChevronRight size={18} /></button>
        </span>
      )}
    </div>
  );
}

const Count = ({ n, tone = 'warn' }) => (n > 0 ? <span className={`tabular ml-1.5 rounded-full px-1.5 text-2xs ${tone === 'danger' ? 'bg-danger/15 text-danger' : 'bg-warn/15 text-warn'}`}>{n}</span> : null);
const Row = ({ children }) => <tr className="border-b border-line transition hover:bg-surface-2/70">{children}</tr>;
const Th = ({ children, className = '' }) => <th className={`px-3 py-2.5 text-left text-xs font-semibold text-fg-muted ${className}`}>{children}</th>;
const Td = ({ children, className = '' }) => <td className={`px-3 py-3 align-middle ${className}`}>{children}</td>;
const Act = ({ danger, ...p }) => <button className={`btn-sm btn ${danger ? 'text-danger hover:bg-danger/10' : 'hover:bg-surface-2'}`} {...p} />;
const ActLink = (p) => <Link className="btn-sm btn hover:bg-surface-2" {...p} />;
const Thumb = ({ src, className = 'h-12 w-9' }) => (src ? <img src={src} alt="" className={`${className} rounded-sm object-cover`} /> : <span className={`${className} block rounded-sm bg-surface-3`} />);

/** Số báo cáo + thống kê lý do + ghi chú của người báo cáo */
function ReportSummary({ item }) {
  return (
    <>
      <p className="mt-1 flex items-center gap-1.5 text-sm"><Flag size={14} className="text-danger" /><b className="tabular">{item.openReports}</b> báo cáo · gần nhất {timeAgo(item.lastReportedAt)}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {Object.entries(item.reasonCounts || {}).sort((a, b) => b[1] - a[1]).map(([r, n]) => (
          <span key={r} className="rounded bg-surface-2 px-2 py-0.5 text-xs font-medium">{REPORT_REASON_LABEL[r] || r} <b className="tabular">×{n}</b></span>
        ))}
      </div>
      {item.reports.some((r) => r.note) && (
        <ul className="mt-2 space-y-1 text-sm text-fg-muted">
          {item.reports.filter((r) => r.note).map((r) => (
            <li key={r._id} className="line-clamp-2">“{r.note}” <span className="text-xs text-fg-subtle">— {r.reporterId?.username || 'ẩn danh'}</span></li>
          ))}
        </ul>
      )}
    </>
  );
}

export default function Admin() {
  const { user: me, isAdmin } = useAuth();
  const tabs = TABS.filter((t) => isAdmin || !t.adminOnly);
  const [tab, setTab] = useState(tabs[0].key);
  const [stats, setStats] = useState(null);
  const [modStatus, setModStatus] = useState(null);
  const [data, setData] = useState(null); // { items, page, totalPages, total } của tab đang mở
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState(''); // search sau khi chờ gõ xong
  const [filter, setFilter] = useState({ comments: 'pending', users: '', videos: '', reports: 'video' });
  const [ask, setAsk] = useState(null);
  const reqId = useRef(0);

  const loadStats = () => adminApi.getStats().then(setStats).catch((e) => toast.error(errMsg(e)));
  useEffect(() => { loadStats(); }, []);
  useEffect(() => { if (tab === 'comments') adminApi.getModerationStatus().then(setModStatus).catch(() => {}); }, [tab]);

  // Chờ gõ xong mới tìm
  useEffect(() => { const t = setTimeout(() => { setQuery(search.trim()); setPage(1); }, 300); return () => clearTimeout(t); }, [search]);
  const switchTab = (k) => { setTab(k); setPage(1); setSearch(''); setQuery(''); setData(null); };
  const setTabFilter = (v) => { setFilter((f) => ({ ...f, [tab]: v })); setPage(1); setData(null); };

  const fetchTab = useCallback(() => {
    const f = filter[tab];
    switch (tab) {
      case 'users': return adminApi.getUsers({ page, search: query, ...(f.startsWith('role:') ? { role: f.slice(5) } : { status: f }) });
      case 'videos': return adminApi.getAdminVideos({ page, search: query, moderationStatus: f });
      case 'flagged': return adminApi.getFlaggedVideos({ page });
      case 'comments': return adminApi.getModerationComments({ page, status: f, search: query });
      case 'logs': return adminApi.getAuditLogs({ page });
      case 'reports': return { video: adminApi.getReports, comment: adminApi.getCommentReports, user: adminApi.getUserReports }[f]({ page, status: 'open' });
      default: return null;
    }
  }, [tab, page, query, filter]);

  const reload = useCallback(() => {
    const p = fetchTab();
    if (!p) return;
    const id = ++reqId.current;
    p.then((r) => id === reqId.current && setData(r))
      .catch((e) => { if (id === reqId.current) { setData({ items: [], page: 1, totalPages: 1, total: 0 }); toast.error(errMsg(e)); } });
  }, [fetchTab]);
  useEffect(() => { reload(); }, [reload]);

  const afterAction = (msg) => { toast(msg); reload(); loadStats(); };
  const act = async (fn, msg) => { try { await fn(); afterAction(msg); } catch (e) { toast.error(errMsg(e)); } };

  // ── Thao tác ──
  const banUser = (u) => setAsk({
    kind: 'ban', title: `Khoá @${u.username}?`, confirm: 'Khoá tài khoản', reasonHint: 'người bị khoá thấy khi đăng nhập',
    text: 'Tài khoản bị đăng xuất ngay. Toàn bộ video và bình luận của họ bị ẩn cho tới khi mở khoá.',
    run: async (reason) => { await adminApi.banUser(u._id, reason); afterAction('Đã khoá tài khoản'); },
  });
  const removeVideo = (v) => setAsk({
    kind: 'removeVideo', title: 'Gỡ video này?', confirm: 'Gỡ video', reasonHint: 'gửi kèm thông báo cho chủ video',
    text: `“${v.title}” của @${v.author.username} sẽ bị ẩn với mọi người. Chủ video nhận được thông báo.`,
    run: async (reason) => { await adminApi.removeVideo(v._id, reason); afterAction('Đã gỡ video'); },
  });
  const hideComment = (c) => setAsk({
    kind: 'hideComment', title: 'Ẩn bình luận này?', confirm: 'Ẩn bình luận', reasonHint: 'gửi kèm thông báo cho người viết',
    text: `“${String(c.content).slice(0, 140)}”`,
    run: async (reason) => { await adminApi.rejectComment(c._id, reason); afterAction('Đã ẩn bình luận'); },
  });
  const changeRole = (u, role) => {
    if (!confirm(`Đổi vai trò của @${u.username} thành "${ROLE_LABEL[role]}"?\n\n${role === 'user' ? 'Họ sẽ mất quyền vào trang kiểm duyệt.' : role === 'moderator' ? 'Họ sẽ duyệt được video, bình luận và báo cáo.' : 'Họ sẽ có toàn quyền quản trị, kể cả khoá tài khoản và đổi vai trò.'}`)) return;
    act(() => adminApi.changeRole(u._id, role), `Đã đổi vai trò thành ${ROLE_LABEL[role]}`);
  };

  const rows = data?.items;
  const videoTable = (list) => (
    <table className="w-full min-w-[720px] text-sm">
      <thead><tr className="border-b border-line"><Th>Video</Th><Th>Tác giả</Th><Th>Trạng thái</Th><Th className="text-right">Lượt xem</Th><Th /></tr></thead>
      <tbody>
        {list.map((v) => (
          <Row key={v._id}>
            <Td>
              <Link to={`/watch/${v._id}`} className="flex items-center gap-3 hover:text-brand-text">
                <Thumb src={v.thumbnailUrl} />
                <span className="line-clamp-2 max-w-[260px] font-semibold">{v.title}</span>
              </Link>
            </Td>
            <Td className="text-fg-muted">{v.author.username}</Td>
            <Td>
              <span className="text-xs text-fg-muted">{v.status}</span>
              {v.moderationStatus && v.moderationStatus !== 'approved' && <span className="ml-2 rounded-sm bg-danger/10 px-1.5 py-0.5 text-2xs font-semibold text-danger">{MOD[v.moderationStatus] || v.moderationStatus}</span>}
              {v.authorBanned && <span className="ml-2 rounded-sm bg-surface-3 px-1.5 py-0.5 text-2xs font-semibold text-fg-muted">Chủ bị khoá</span>}
              {(v.removeReason || v.flagReason) && <span className="block max-w-[220px] truncate text-xs text-fg-subtle">{v.removeReason || v.flagReason}</span>}
            </Td>
            <Td className="tabular text-right">{formatCount(v.viewCount)}</Td>
            <Td className="whitespace-nowrap text-right">
              <ActLink to={`/admin/videos/${v._id}/analytics`}>Phân tích</ActLink>
              {v.moderationStatus !== 'approved' && <Act onClick={() => act(() => adminApi.approveVideo(v._id), v.moderationStatus === 'removed' ? 'Đã khôi phục video' : 'Đã duyệt video')}>{v.moderationStatus === 'removed' ? 'Khôi phục' : 'Duyệt'}</Act>}
              {v.moderationStatus !== 'removed' && <Act danger onClick={() => removeVideo(v)}>Gỡ</Act>}
            </Td>
          </Row>
        ))}
      </tbody>
    </table>
  );

  const reportKind = filter.reports;
  const emptyText = tab === 'reports' ? 'Không có báo cáo nào cần xử lý.'
    : tab === 'flagged' ? 'Không có video nào chờ duyệt.'
      : tab === 'comments' ? (query ? 'Không tìm thấy bình luận.' : filter.comments === 'pending' ? 'Không có bình luận nào chờ duyệt.' : 'Không có bình luận.')
        : query ? 'Không tìm thấy kết quả.' : 'Không có dữ liệu.';
  const chips = tab === 'comments' ? COMMENT_FILTERS : tab === 'users' ? USER_FILTERS : tab === 'videos' ? VIDEO_FILTERS : null;
  const searchable = ['users', 'videos', 'comments'].includes(tab);
  const totalReports = (stats?.pendingReports || 0) + (stats?.pendingCommentReports || 0) + (stats?.pendingUserReports || 0);

  return (
    <div className="mx-auto max-w-[1200px] px-4 pb-16 pt-6 lg:px-8 lg:pt-10">
      <h1 className="hidden text-2xl font-bold lg:block">{isAdmin ? 'Quản trị' : 'Kiểm duyệt'}</h1>

      <div className="grid grid-cols-2 gap-3 lg:mt-6 lg:grid-cols-4">
        <StatCard label="Người dùng" value={stats && formatCount(stats.users ?? 0)} sub={stats && `+${stats.newUsersToday ?? 0} hôm nay · ${stats.bannedUsers ?? 0} bị khoá`} />
        <StatCard label="Video" value={stats && formatCount(stats.videos ?? 0)} sub={stats && `${formatCount(stats.totalViews ?? 0)} lượt xem`} />
        <StatCard label="Báo cáo chờ xử lý" value={stats && formatCount(totalReports)} tone={totalReports ? 'text-danger' : ''}
          sub={stats && `${stats.pendingReports ?? 0} video · ${stats.pendingCommentReports ?? 0} bình luận · ${stats.pendingUserReports ?? 0} tài khoản`} />
        <StatCard label="Bình luận chờ duyệt" value={stats && formatCount(stats.pendingComments ?? 0)} tone={stats?.pendingComments ? 'text-warn' : ''} />
      </div>

      <nav className="no-scrollbar mt-8 flex gap-6 overflow-x-auto border-b border-line" role="tablist">
        {tabs.map(({ key, label }) => (
          <button key={key} role="tab" aria-selected={tab === key} onClick={() => switchTab(key)} className={`tab shrink-0 ${tab === key ? 'tab-active' : ''}`}>
            {label}
            {key === 'reports' && <Count n={totalReports} tone="danger" />}
            {key === 'flagged' && <Count n={stats?.flaggedVideos} />}
            {key === 'comments' && <Count n={stats?.pendingComments} />}
          </button>
        ))}
      </nav>

      {tab === 'comments' && <ModerationBanner status={modStatus} />}

      {tab !== 'analytics' && (chips || searchable || tab === 'reports') && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {tab === 'reports' && REPORT_KINDS.map(([k, label, statKey]) => (
            <button key={k} onClick={() => setTabFilter(k)} className={`chip ${reportKind === k ? 'chip-active' : ''}`}>{label}{stats?.[statKey] > 0 && <span className="tabular text-xs opacity-70">{stats[statKey]}</span>}</button>
          ))}
          {chips?.map(([k, label]) => (
            <button key={k} onClick={() => setTabFilter(k)} className={`chip ${filter[tab] === k ? 'chip-active' : ''}`}>{label}</button>
          ))}
          {searchable && (
            <label className="ml-auto flex h-9 w-full items-center gap-2 rounded bg-surface-2 px-3 text-fg-muted focus-within:ring-2 focus-within:ring-brand/30 sm:w-64">
              <Search size={16} />
              <input value={search} onChange={(e) => setSearch(e.target.value)} className="w-full bg-transparent text-sm text-fg outline-none placeholder:text-fg-subtle"
                placeholder={tab === 'users' ? (isAdmin ? 'Tìm tên hoặc email' : 'Tìm tên người dùng') : tab === 'videos' ? 'Tìm tiêu đề hoặc người đăng' : 'Tìm nội dung hoặc người viết'} />
            </label>
          )}
        </div>
      )}

      {tab === 'analytics' ? <div className="mt-6"><AdminAnalytics /></div> : (
        <>
          <div className="mt-4 overflow-x-auto pb-24">
            {rows == null ? (
              <div className="space-y-2">{[0, 1, 2, 3, 4].map((i) => <span key={i} className="skeleton block h-12 rounded" />)}</div>
            ) : !rows.length ? (
              <p className="px-6 py-14 text-center text-fg-muted">{emptyText}</p>
            ) : tab === 'users' ? (
              <table className="w-full min-w-[760px] text-sm">
                <thead><tr className="border-b border-line"><Th>Người dùng</Th><Th>Vai trò</Th><Th className="text-right">Follower</Th><Th>Trạng thái</Th><Th /></tr></thead>
                <tbody>
                  {rows.map((u, i) => {
                    const self = u._id === me?._id;
                    const menu = isAdmin && !self && [
                      !u.isVerified ? { label: 'Cấp tích xanh', icon: BadgeCheck, onClick: () => act(() => adminApi.verifyUser(u._id), 'Đã cấp tích xanh') }
                        : { label: 'Thu tích xanh', icon: BadgeCheck, onClick: () => act(() => adminApi.unverifyUser(u._id), 'Đã thu tích xanh') },
                      !u.bannedAt && u.role !== 'moderator' && { label: 'Đặt làm kiểm duyệt viên', icon: ShieldCheck, onClick: () => changeRole(u, 'moderator') },
                      !u.bannedAt && u.role !== 'admin' && { label: 'Đặt làm quản trị', icon: UserCog, onClick: () => changeRole(u, 'admin') },
                      u.role !== 'user' && { label: 'Hạ về người dùng', icon: ShieldOff, onClick: () => changeRole(u, 'user'), danger: true },
                    ];
                    return (
                      <Row key={u._id}>
                        <Td>
                          <Link to={`/profile/${u.username}`} className="flex items-center gap-3 hover:text-brand-text">
                            <Avatar user={u} size={34} />
                            <span><span className="flex items-center gap-1 font-semibold">{u.username}{u.isVerified && <BadgeCheck size={14} className="text-brand-text" />}</span>{u.email && <span className="text-xs text-fg-muted">{u.email}</span>}</span>
                          </Link>
                        </Td>
                        <Td className={u.role === 'user' ? 'text-fg-muted' : 'font-semibold'}>{ROLE_LABEL[u.role] || u.role}</Td>
                        <Td className="tabular text-right">{formatCount(u.followerCount || 0)}</Td>
                        <Td>
                          {u.bannedAt ? (
                            <span className="text-sm text-danger" title={u.banReason || undefined}>
                              <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-danger" />Bị khoá · {timeAgo(u.bannedAt)}</span>
                              {u.banReason && <span className="block max-w-[200px] truncate text-xs text-fg-subtle">{u.banReason}</span>}
                            </span>
                          ) : u.isOnline ? (
                            <span className="inline-flex items-center gap-1.5 text-sm text-success"><span className="h-1.5 w-1.5 rounded-full bg-success" />Đang online</span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-sm text-fg-muted">
                              <span className="h-1.5 w-1.5 rounded-full bg-fg-subtle" />
                              {lastSeenLabel(u.lastActiveAt || u.lastLoginAt)}
                            </span>
                          )}
                        </Td>
                        <Td className="whitespace-nowrap text-right">
                          {isAdmin && !self && u.role !== 'admin' && (u.bannedAt
                            ? <Act onClick={() => act(() => adminApi.unbanUser(u._id), 'Đã mở khoá — nội dung của họ hiện lại')}>Mở khoá</Act>
                            : <Act danger onClick={() => banUser(u)}>Khoá</Act>)}
                          {menu && (
                            <span className="inline-block align-middle">
                              <Menu items={menu} up={rows.length > 3 && i >= rows.length - 3} trigger={({ toggle }) => <button onClick={toggle} className="icon-btn !h-8 !w-8" aria-label={`Tuỳ chọn cho ${u.username}`}><MoreHorizontal size={17} /></button>} />
                            </span>
                          )}
                        </Td>
                      </Row>
                    );
                  })}
                </tbody>
              </table>
            ) : tab === 'reports' && reportKind === 'video' ? (
              <ul className="divide-y divide-line">
                {rows.map((v) => (
                  <li key={v._id} className="flex flex-col gap-4 px-3 py-4 sm:flex-row">
                    <Link to={`/watch/${v._id}`} className="shrink-0"><Thumb src={v.thumbnailUrl} className="h-28 w-20" /></Link>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link to={`/watch/${v._id}`} className="line-clamp-1 font-semibold hover:text-brand-text">{v.title}</Link>
                        <span className="text-sm text-fg-muted">{v.author.username}</span>
                        {v.moderationStatus === 'flagged' && <span className="rounded-sm bg-danger/10 px-1.5 py-0.5 text-2xs font-semibold text-danger">Đã gắn cờ</span>}
                      </div>
                      <ReportSummary item={v} />
                    </div>
                    <div className="flex shrink-0 items-start gap-1 sm:flex-col sm:items-end">
                      <Act onClick={() => act(() => adminApi.approveVideo(v._id), 'Đã giữ video, đóng các báo cáo')}>Giữ video</Act>
                      <Act danger onClick={() => removeVideo(v)}>Gỡ video</Act>
                      <ActLink to={`/admin/videos/${v._id}/analytics`}>Phân tích</ActLink>
                    </div>
                  </li>
                ))}
              </ul>
            ) : tab === 'reports' && reportKind === 'comment' ? (
              <ul className="divide-y divide-line">
                {rows.map((c) => (
                  <li key={c._id} className="flex flex-col gap-4 px-3 py-4 sm:flex-row">
                    <div className="min-w-0 flex-1">
                      <Link to={`/profile/${c.userId?.username}`} className="inline-flex items-center gap-2 text-sm font-semibold hover:text-brand-text"><Avatar user={c.userId} size={24} /> {c.userId?.username}</Link>
                      <p className="mt-1 whitespace-pre-wrap break-words text-base">{c.content}</p>
                      {c.videoId && <Link to={`/watch/${c.videoId._id}`} className="mt-1 inline-block text-xs text-fg-muted hover:text-fg hover:underline">Trong video: {c.videoId.title}</Link>}
                      <ReportSummary item={c} />
                    </div>
                    <div className="flex shrink-0 items-start gap-1 sm:flex-col sm:items-end">
                      <Act onClick={() => act(() => adminApi.dismissCommentReports(c._id), 'Đã bỏ qua báo cáo')}>Không vi phạm</Act>
                      <Act danger onClick={() => hideComment(c)}><EyeOff size={13} /> Ẩn bình luận</Act>
                    </div>
                  </li>
                ))}
              </ul>
            ) : tab === 'reports' ? (
              <ul className="divide-y divide-line">
                {rows.map((u) => (
                  <li key={u._id} className="flex flex-col gap-4 px-3 py-4 sm:flex-row">
                    <Link to={`/profile/${u.username}`} className="shrink-0"><Avatar user={u} size={56} /></Link>
                    <div className="min-w-0 flex-1">
                      <Link to={`/profile/${u.username}`} className="flex items-center gap-1 font-semibold hover:text-brand-text">{u.username}{u.isVerified && <BadgeCheck size={14} className="text-brand-text" />}</Link>
                      <p className="text-sm text-fg-muted">{ROLE_LABEL[u.role]} · {formatCount(u.followerCount || 0)} follower · tham gia {timeAgo(u.createdAt)}</p>
                      <ReportSummary item={u} />
                    </div>
                    <div className="flex shrink-0 items-start gap-1 sm:flex-col sm:items-end">
                      <Act onClick={() => act(() => adminApi.dismissUserReports(u._id), 'Đã bỏ qua báo cáo')}>Không vi phạm</Act>
                      {isAdmin ? <Act danger onClick={() => banUser(u)}>Khoá tài khoản</Act> : <span className="px-3 py-1 text-xs text-fg-subtle">Chỉ quản trị mới khoá được</span>}
                      <ActLink to={`/profile/${u.username}`}>Xem hồ sơ</ActLink>
                    </div>
                  </li>
                ))}
              </ul>
            ) : tab === 'comments' ? (
              <table className="w-full min-w-[760px] text-sm">
                <thead><tr className="border-b border-line"><Th>Bình luận</Th><Th>Video</Th><Th>Điểm vi phạm</Th><Th /></tr></thead>
                <tbody>
                  {rows.map((c) => (
                    <Row key={c._id}>
                      <Td className="max-w-[360px]">
                        <Link to={`/profile/${c.userId?.username}`} className="flex items-center gap-2 font-semibold hover:text-brand-text">
                          <Avatar user={c.userId} size={24} /> {c.userId?.username}
                          {c.userId?.bannedAt && <span className="rounded-sm bg-danger/10 px-1.5 text-2xs text-danger">Đã khoá</span>}
                        </Link>
                        <p className="mt-1 whitespace-pre-wrap break-words">{c.content}</p>
                        <span className="text-xs text-fg-subtle">{timeAgo(c.createdAt)}{c.moderation?.reviewedBy && ` · xử lý bởi ${c.moderation.reviewedBy.username}`}</span>
                      </Td>
                      <Td>
                        {c.videoId ? (
                          <Link to={`/watch/${c.videoId._id}`} className="flex items-center gap-2 hover:text-brand-text">
                            <Thumb src={c.videoId.thumbnailUrl} className="h-10 w-7" />
                            <span className="line-clamp-2 max-w-[180px] text-xs font-semibold">{c.videoId.title}</span>
                          </Link>
                        ) : <span className="text-fg-subtle">Video đã xoá</span>}
                      </Td>
                      <Td><ScoreBar score={c.moderation?.score} source={c.moderation?.source} />{c.moderation?.label && <span className="mt-1 block text-2xs text-fg-subtle">{c.moderation.label}</span>}</Td>
                      <Td className="whitespace-nowrap text-right">
                        {c.moderationStatus !== 'approved' && <Act onClick={() => act(() => adminApi.approveComment(c._id), 'Đã duyệt — bình luận hiện công khai')}><Check size={13} /> Hiện</Act>}
                        {c.moderationStatus !== 'rejected' && <Act danger onClick={() => hideComment(c)}><EyeOff size={13} /> Ẩn</Act>}
                      </Td>
                    </Row>
                  ))}
                </tbody>
              </table>
            ) : tab === 'logs' ? (
              <ul className="divide-y divide-line text-sm">
                {rows.map((l, i) => (
                  <li key={l._id || i} className="flex justify-between gap-4 px-3 py-3">
                    <span className="min-w-0">
                      <b className="font-semibold">{l.adminId?.username || 'admin'}</b> · {LOG_LABEL[l.action] || l.action}
                      {(l.details?.username || l.details?.title || l.details?.content) && (
                        <span className="ml-1 text-fg-muted">“{String(l.details.username || l.details.title || l.details.content).slice(0, 80)}”</span>
                      )}
                      {l.action === 'change_role' && <span className="ml-1 text-fg-muted">{ROLE_LABEL[l.details?.previousRole]} → {ROLE_LABEL[l.details?.role]}</span>}
                      {l.details?.reason && <span className="block truncate text-xs text-fg-subtle">Lý do: {l.details.reason}</span>}
                    </span>
                    <span className="shrink-0 text-fg-subtle">{timeAgo(l.createdAt)}</span>
                  </li>
                ))}
              </ul>
            ) : videoTable(rows)}
          </div>
          {data && <div className="-mt-20"><Pager page={data.page} totalPages={data.totalPages} total={data.total} onPage={(p) => { setPage(p); setData((d) => ({ ...d, items: null })); }} /></div>}
        </>
      )}

      <ReasonDialog ask={ask} onClose={() => setAsk(null)} />
    </div>
  );
}
