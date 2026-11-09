import { Routes, Route, Link, matchPath, useLocation, useOutlet } from 'react-router-dom';
import PrivateRoute from './PrivateRoute';
import Header from '../components/layout/Header';
import Sidebar from '../components/layout/Sidebar';
import BottomNav from '../components/layout/BottomNav';
import Home from '../pages/Home';
import Login from '../pages/Login';
import Register from '../pages/Register';
import Profile from '../pages/Profile';
import Upload from '../pages/Upload';
import VideoDetail from '../pages/VideoDetail';
import Search from '../pages/Search';
import Inbox from '../pages/Inbox';
import Admin from '../pages/Admin';

// Thanh trên cùng (mobile) theo từng trang. feed: video tràn màn hình, không có header.
const MOBILE = [
  ['/', { feed: true }], ['/following', { feed: true }], ['/watch/:id', { bare: true }],
  ['/profile/:username', { back: true, title: (p) => p.username }], ['/upload', { back: true, title: () => 'Tải lên' }],
  ['/inbox', { title: () => 'Hoạt động' }], ['/admin/*', { back: true, title: () => 'Quản trị' }], ['/search', {}],
];

function Shell() {
  const { pathname } = useLocation();
  const outlet = useOutlet();
  let conf = {}, params = {};
  for (const [path, c] of MOBILE) {
    const m = matchPath(path, pathname);
    if (m) { conf = c; params = m.params; break; }
  }
  return (
    <div className="flex h-dvh">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        {!conf.feed && !conf.bare && <Header back={conf.back} title={conf.title?.(params)} />}
        <main className="relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden">{outlet}</main>
        {!conf.bare && <BottomNav dark={conf.feed} />}
      </div>
    </div>
  );
}

// Bấm "Tải lên" khi đang ở trang tải lên -> mở form mới (mỗi lần điều hướng có key riêng)
function UploadPage() {
  const { key } = useLocation();
  return <Upload key={key} />;
}

function NotFound() {
  return (
    <div className="grid h-full place-items-center px-6 text-center">
      <div>
        <p className="tabular text-3xl font-bold">404</p>
        <p className="mt-1 text-fg-muted">Trang bạn tìm không tồn tại.</p>
        <Link to="/" className="btn-outline mt-5">Về trang chủ</Link>
      </div>
    </div>
  );
}

export default function AppRouter() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route element={<Shell />}>
        <Route path="/" element={<Home tab="for-you" />} />
        <Route path="/following" element={<Home tab="following" />} />
        <Route path="/profile/:username" element={<Profile />} />
        <Route path="/watch/:id" element={<VideoDetail />} />
        <Route path="/search" element={<Search />} />
        <Route path="/inbox" element={<Inbox />} />
        <Route path="/upload" element={<PrivateRoute><UploadPage /></PrivateRoute>} />
        <Route path="/admin/*" element={<PrivateRoute role="admin"><Admin /></PrivateRoute>} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
