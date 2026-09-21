import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';

import Header from '../../components/layout/Header';
import Sidebar from '../../components/layout/Sidebar';
import Button from '../../components/common/Button';
import Spinner from '../../components/common/Spinner';
import {
  getStats,
  getUsers,
  banUser,
  unbanUser,
  getFlaggedVideos,
  approveVideo,
  removeVideo,
  getAuditLogs,
} from '../../api/admin.api';
import useAuthStore from '../../store/slices/authSlice';
import { formatCount, timeAgo } from '../../utils/format';

const TABS = [
  { key: 'overview', label: 'Tổng quan' },
  { key: 'moderation', label: 'Kiểm duyệt' },
  { key: 'users', label: 'Người dùng' },
  { key: 'logs', label: 'Nhật ký' },
];

const StatCard = ({ label, value, sub }) => (
  <div className="glass rounded-xl p-4">
    <p className="text-sm text-gray-400">{label}</p>
    <p className="text-2xl font-bold mt-1">{value}</p>
    {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
  </div>
);

export default function Admin() {
  const [tab, setTab] = useState('overview');
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [flagged, setFlagged] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  const user = useAuthStore((s) => s.user);
  const hasAccess = user && ['admin', 'moderator'].includes(user.role);

  const load = async () => {
    setLoading(true);
    try {
      const [statsData, usersData, flaggedData, logsData] = await Promise.all([
        getStats(),
        getUsers({ limit: 20 }),
        getFlaggedVideos({ limit: 20 }),
        getAuditLogs({ limit: 30 }),
      ]);
      setStats(statsData);
      setUsers(usersData.items);
      setFlagged(flaggedData.items);
      setLogs(logsData.items);
    } catch (err) {
      toast.error('Không tải được dữ liệu quản trị');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (hasAccess) load();
    else setLoading(false);
  }, [hasAccess]);

  const act = async (fn, successMessage) => {
    try {
      await fn();
      toast.success(successMessage);
      await load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Thao tác thất bại');
    }
  };

  if (!hasAccess) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-400">
        Bạn không có quyền truy cập trang này
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <div className="flex flex-1 pt-16">
        <Sidebar />
        <main className="flex-1 lg:ml-64 p-4 sm:p-8">
          <h1 className="text-2xl font-bold mb-6">Quản trị</h1>

          <div className="flex gap-6 border-b border-white/10 mb-6 overflow-x-auto">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`pb-3 text-sm font-semibold border-b-2 whitespace-nowrap transition-colors ${
                  tab === t.key ? 'border-brand-from text-white' : 'border-transparent text-gray-400'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {loading && (
            <div className="flex justify-center py-16">
              <Spinner size="lg" />
            </div>
          )}

          {!loading && tab === 'overview' && stats && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                label="Người dùng"
                value={formatCount(stats.users.total)}
                sub={`+${stats.users.newLast7Days} trong 7 ngày`}
              />
              <StatCard
                label="Video"
                value={formatCount(stats.videos.total)}
                sub={`${stats.videos.processing} đang xử lý, ${stats.videos.failed} lỗi`}
              />
              <StatCard
                label="Lượt xem"
                value={formatCount(stats.engagement.views)}
                sub={`${formatCount(stats.engagement.likes)} lượt thích`}
              />
              <StatCard
                label="Báo cáo chờ xử lý"
                value={stats.moderation.openReports}
                sub={`${stats.users.banned} tài khoản bị khoá`}
              />
            </div>
          )}

          {!loading && tab === 'moderation' && (
            <div className="flex flex-col gap-3">
              {flagged.map((v) => (
                <div key={v._id} className="glass rounded-xl p-4 flex items-center gap-4">
                  <div className="w-16 h-24 bg-white/5 rounded overflow-hidden shrink-0">
                    {v.thumbnailUrl && (
                      <img src={v.thumbnailUrl} alt={v.title} className="w-full h-full object-cover" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">{v.title}</p>
                    <p className="text-sm text-gray-400">
                      {v.userId?.username} · {v.reportCount} báo cáo
                    </p>
                    {v.flagReason && <p className="text-xs text-gray-400 mt-1">{v.flagReason}</p>}
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" onClick={() => act(() => approveVideo(v._id), 'Đã duyệt')}>
                      Duyệt
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => act(() => removeVideo(v._id, 'Vi phạm tiêu chuẩn cộng đồng'), 'Đã gỡ video')}
                    >
                      Gỡ
                    </Button>
                  </div>
                </div>
              ))}
              {!flagged.length && <p className="text-gray-400">Không có video nào chờ kiểm duyệt</p>}
            </div>
          )}

          {!loading && tab === 'users' && (
            <div className="flex flex-col gap-2">
              {users.map((u) => (
                <div key={u._id} className="glass rounded-xl p-4 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold">
                      {u.username}
                      {u.role !== 'user' && (
                        <span className="ml-2 text-xs text-brand-from uppercase">{u.role}</span>
                      )}
                    </p>
                    <p className="text-sm text-gray-400 truncate">
                      {u.email} · {formatCount(u.followerCount)} follower
                    </p>
                  </div>
                  {u.bannedAt ? (
                    <Button size="sm" variant="ghost" onClick={() => act(() => unbanUser(u._id), 'Đã mở khoá')}>
                      Mở khoá
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => act(() => banUser(u._id, 'Vi phạm tiêu chuẩn cộng đồng'), 'Đã khoá')}
                    >
                      Khoá
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}

          {!loading && tab === 'logs' && (
            <div className="flex flex-col gap-1 text-sm">
              {logs.map((l) => (
                <div key={l._id} className="flex gap-3 p-3 rounded-lg hover:bg-white/5">
                  <span className="text-gray-400 w-32 shrink-0">{timeAgo(l.createdAt)}</span>
                  <span className="font-mono text-brand-from w-32 shrink-0">{l.action}</span>
                  <span className="text-gray-300 truncate">
                    {l.actorUsername} · {l.targetType} {String(l.targetId).slice(-6)}
                    {l.reason ? ` · ${l.reason}` : ''}
                  </span>
                </div>
              ))}
              {!logs.length && <p className="text-gray-400">Chưa có thao tác nào được ghi nhận</p>}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
