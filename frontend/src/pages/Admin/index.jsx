import { useState, useEffect } from 'react';
import { Routes, Route, NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Users, Video, Shield, LogOut, Menu, X,
  TrendingUp, Eye, Heart, Ban, CheckCircle, Trash2, AlertCircle
} from 'lucide-react';
import useAuthStore from '../../store/slices/authSlice';
import api from '../../api/axiosClient';
import { formatCount, timeAgo } from '../../utils/format';

// ─── Layout ───────────────────────────────────────────────────────────────────

function AdminLayout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const { user, clearAuth } = useAuthStore();
  const navigate = useNavigate();

  const navItems = [
    { to: '/admin',         label: 'Dashboard',  icon: LayoutDashboard, end: true },
    { to: '/admin/users',   label: 'Người dùng', icon: Users },
    { to: '/admin/videos',  label: 'Video',      icon: Video },
    { to: '/admin/flagged', label: 'Kiểm duyệt', icon: Shield },
  ];

  const handleLogout = () => { clearAuth(); navigate('/login'); };

  return (
    <div className="flex h-screen bg-[#0a0a0a] text-white overflow-hidden">
      {/* Sidebar */}
      <aside className={`${sidebarOpen ? 'w-56' : 'w-16'} flex-shrink-0 bg-[#111] border-r border-white/10 flex flex-col transition-all duration-200`}>
        {/* Logo */}
        <div className="flex items-center gap-3 px-4 h-16 border-b border-white/10">
          <button onClick={() => setSidebarOpen(o => !o)} className="p-1 rounded hover:bg-white/10 transition-colors">
            {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
          {sidebarOpen && <span className="font-bold text-lg gradient-text">TikTak Admin</span>}
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 space-y-1 px-2">
          {navItems.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-sm font-medium
                 ${isActive ? 'gradient-bg text-white' : 'text-gray-400 hover:bg-white/5 hover:text-white'}`
              }
            >
              <Icon size={18} className="flex-shrink-0" />
              {sidebarOpen && <span>{label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* User info + logout */}
        <div className="border-t border-white/10 p-3">
          {sidebarOpen && (
            <p className="text-xs text-gray-500 mb-2 truncate px-1">
              Xin chào, <span className="text-white font-medium">{user?.username}</span>
            </p>
          )}
          <button onClick={handleLogout}
            className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm text-gray-400 hover:bg-red-500/10 hover:text-red-400 transition-colors">
            <LogOut size={16} />
            {sidebarOpen && 'Đăng xuất'}
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        <div className="p-6">{children}</div>
      </main>
    </div>
  );
}

// ─── Stats Card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, icon: Icon, color }) {
  return (
    <div className="bg-[#111] border border-white/10 rounded-xl p-5 flex items-center gap-4">
      <div className={`p-3 rounded-lg ${color}`}>
        <Icon size={22} />
      </div>
      <div>
        <p className="text-gray-400 text-sm">{label}</p>
        <p className="text-2xl font-bold mt-0.5">{value ?? '—'}</p>
      </div>
    </div>
  );
}

// ─── Dashboard ─────────────────────────────────────────────────────────────────

function Dashboard() {
  const [stats, setStats] = useState(null);
  const [recentVideos, setRecentVideos] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/admin/stats').then(r => r.data.data),
      api.get('/admin/videos?limit=5').then(r => r.data.data),
    ]).then(([s, v]) => {
      setStats(s);
      setRecentVideos(Array.isArray(v) ? v : v?.videos || []);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center items-center h-64"><div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Tổng người dùng" value={formatCount(stats?.totalUsers || 0)} icon={Users}      color="bg-purple-500/20 text-purple-400" />
        <StatCard label="Tổng video"       value={formatCount(stats?.totalVideos || 0)} icon={Video}     color="bg-pink-500/20 text-pink-400" />
        <StatCard label="Tổng lượt xem"   value={formatCount(stats?.totalViews || 0)} icon={Eye}        color="bg-blue-500/20 text-blue-400" />
        <StatCard label="Đang chờ duyệt"  value={stats?.pendingModeration || 0}        icon={AlertCircle} color="bg-yellow-500/20 text-yellow-400" />
      </div>

      <div className="bg-[#111] border border-white/10 rounded-xl p-5">
        <h2 className="font-semibold mb-4 text-gray-300">Video mới nhất</h2>
        {recentVideos.length === 0 ? (
          <p className="text-gray-500 text-sm">Chưa có video nào</p>
        ) : (
          <div className="space-y-3">
            {recentVideos.map(v => (
              <div key={v._id} className="flex items-center gap-3 py-2 border-b border-white/5 last:border-0">
                {v.thumbnailUrl
                  ? <img src={v.thumbnailUrl} alt="" className="w-12 h-12 object-cover rounded-lg bg-gray-800" />
                  : <div className="w-12 h-12 bg-gray-800 rounded-lg flex items-center justify-center"><Video size={16} className="text-gray-600" /></div>
                }
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{v.title}</p>
                  <p className="text-xs text-gray-500">{timeAgo(v.createdAt)}</p>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full ${
                  v.status === 'ready' ? 'bg-green-500/20 text-green-400' :
                  v.status === 'processing' ? 'bg-yellow-500/20 text-yellow-400' :
                  'bg-gray-500/20 text-gray-400'
                }`}>{v.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Users Table ───────────────────────────────────────────────────────────────

function UsersPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [actionLoading, setActionLoading] = useState(null);

  const fetchUsers = () => {
    setLoading(true);
    api.get(`/admin/users?search=${search}`).then(r => {
      setUsers(Array.isArray(r.data.data) ? r.data.data : r.data.data?.users || []);
    }).finally(() => setLoading(false));
  };

  useEffect(() => { fetchUsers(); }, [search]);

  const doAction = async (id, action) => {
    setActionLoading(id + action);
    try {
      if (action === 'ban')    await api.post(`/admin/users/${id}/ban`);
      if (action === 'unban')  await api.post(`/admin/users/${id}/unban`);
      if (action === 'verify') await api.post(`/admin/users/${id}/verify`);
      fetchUsers();
    } finally { setActionLoading(null); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Người dùng</h1>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Tìm kiếm..."
          className="bg-[#1e1e1e] border border-white/10 rounded-lg px-4 py-2 text-sm outline-none focus:border-purple-500 w-56"
        />
      </div>

      <div className="bg-[#111] border border-white/10 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-white/10">
            <tr className="text-gray-400 text-left">
              <th className="px-4 py-3 font-medium">Người dùng</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium">Trạng thái</th>
              <th className="px-4 py-3 font-medium">Ngày tạo</th>
              <th className="px-4 py-3 font-medium">Hành động</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="text-center py-10 text-gray-500">Đang tải...</td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-10 text-gray-500">Không có dữ liệu</td></tr>
            ) : users.map(u => (
              <tr key={u._id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {u.avatarUrl
                      ? <img src={u.avatarUrl} className="w-8 h-8 rounded-full object-cover" alt="" />
                      : <div className="w-8 h-8 rounded-full gradient-bg flex items-center justify-center text-xs font-bold">{u.username?.[0]?.toUpperCase()}</div>
                    }
                    <span className="font-medium">{u.username}</span>
                    {u.isVerified && <CheckCircle size={13} className="text-blue-400" />}
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-400">{u.email}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${u.role === 'admin' ? 'bg-purple-500/20 text-purple-300' : 'bg-gray-700 text-gray-300'}`}>{u.role}</span>
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded text-xs ${u.bannedAt ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'}`}>
                    {u.bannedAt ? 'Đã khoá' : 'Hoạt động'}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-400">{timeAgo(u.createdAt)}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    {!u.isVerified && (
                      <button onClick={() => doAction(u._id, 'verify')}
                        disabled={actionLoading === u._id + 'verify'}
                        title="Xác thực"
                        className="p-1.5 rounded hover:bg-blue-500/20 text-gray-400 hover:text-blue-400 transition-colors disabled:opacity-50">
                        <CheckCircle size={15} />
                      </button>
                    )}
                    {u.bannedAt ? (
                      <button onClick={() => doAction(u._id, 'unban')}
                        disabled={actionLoading === u._id + 'unban'}
                        title="Mở khoá"
                        className="p-1.5 rounded hover:bg-green-500/20 text-gray-400 hover:text-green-400 transition-colors disabled:opacity-50">
                        <CheckCircle size={15} />
                      </button>
                    ) : (
                      <button onClick={() => doAction(u._id, 'ban')}
                        disabled={actionLoading === u._id + 'ban' || u.role === 'admin'}
                        title="Khoá tài khoản"
                        className="p-1.5 rounded hover:bg-red-500/20 text-gray-400 hover:text-red-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                        <Ban size={15} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Videos Table ──────────────────────────────────────────────────────────────

function VideosPage() {
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);

  const fetchVideos = () => {
    setLoading(true);
    api.get('/admin/videos').then(r => {
      setVideos(Array.isArray(r.data.data) ? r.data.data : r.data.data?.videos || []);
    }).finally(() => setLoading(false));
  };

  useEffect(() => { fetchVideos(); }, []);

  const removeVideo = async (id) => {
    if (!window.confirm('Xoá video này?')) return;
    setActionLoading(id);
    try { await api.delete(`/admin/videos/${id}`); fetchVideos(); }
    finally { setActionLoading(null); }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Video</h1>
      <div className="bg-[#111] border border-white/10 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-white/10">
            <tr className="text-gray-400 text-left">
              <th className="px-4 py-3 font-medium">Video</th>
              <th className="px-4 py-3 font-medium">Tác giả</th>
              <th className="px-4 py-3 font-medium">Trạng thái</th>
              <th className="px-4 py-3 font-medium">Lượt xem</th>
              <th className="px-4 py-3 font-medium">Like</th>
              <th className="px-4 py-3 font-medium">Ngày đăng</th>
              <th className="px-4 py-3 font-medium">Xoá</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="text-center py-10 text-gray-500">Đang tải...</td></tr>
            ) : videos.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-10 text-gray-500">Không có video nào</td></tr>
            ) : videos.map(v => (
              <tr key={v._id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    {v.thumbnailUrl
                      ? <img src={v.thumbnailUrl} className="w-14 h-10 object-cover rounded-lg bg-gray-800" alt="" />
                      : <div className="w-14 h-10 bg-gray-800 rounded-lg flex items-center justify-center"><Video size={14} className="text-gray-600" /></div>
                    }
                    <span className="font-medium max-w-[160px] truncate">{v.title}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-400">{v.userId?.username || v.userId}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded text-xs ${
                    v.status === 'ready' ? 'bg-green-500/20 text-green-400' :
                    v.status === 'processing' ? 'bg-yellow-500/20 text-yellow-400' :
                    'bg-red-500/20 text-red-400'
                  }`}>{v.status}</span>
                </td>
                <td className="px-4 py-3 text-gray-400">{formatCount(v.viewCount || 0)}</td>
                <td className="px-4 py-3 text-gray-400">{formatCount(v.likeCount || 0)}</td>
                <td className="px-4 py-3 text-gray-400">{timeAgo(v.createdAt)}</td>
                <td className="px-4 py-3">
                  <button onClick={() => removeVideo(v._id)}
                    disabled={actionLoading === v._id}
                    className="p-1.5 rounded hover:bg-red-500/20 text-gray-400 hover:text-red-400 transition-colors disabled:opacity-50">
                    <Trash2 size={15} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Flagged / Moderation ──────────────────────────────────────────────────────

function FlaggedPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Kiểm duyệt</h1>
      <div className="bg-[#111] border border-white/10 rounded-xl p-8 text-center">
        <Shield size={40} className="mx-auto text-gray-600 mb-3" />
        <p className="text-gray-400">Chưa có nội dung bị báo cáo</p>
      </div>
    </div>
  );
}

// ─── Root Admin Component ──────────────────────────────────────────────────────

export default function Admin() {
  const { user } = useAuthStore();
  const navigate = useNavigate();

  // Redirect nếu không phải admin
  if (user && user.role !== 'admin') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a]">
        <div className="text-center">
          <Shield size={48} className="mx-auto text-red-400 mb-4" />
          <h1 className="text-xl font-bold text-red-400 mb-2">Không có quyền truy cập</h1>
          <p className="text-gray-400 mb-4">Trang này chỉ dành cho Admin.</p>
          <button onClick={() => navigate('/')}
            className="px-4 py-2 gradient-bg rounded-lg text-sm font-medium">
            Về trang chủ
          </button>
        </div>
      </div>
    );
  }

  return (
    <AdminLayout>
      <Routes>
        <Route index        element={<Dashboard />} />
        <Route path="users"   element={<UsersPage />} />
        <Route path="videos"  element={<VideosPage />} />
        <Route path="flagged" element={<FlaggedPage />} />
      </Routes>
    </AdminLayout>
  );
}
