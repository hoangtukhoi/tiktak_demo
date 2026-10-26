import { Routes, Route, useLocation, useOutlet, Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
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
import Admin from '../pages/Admin';

/** Khung chính: Header + Sidebar (desktop) + BottomNav (mobile), chuyển trang có hiệu ứng */
function Shell() {
  const location = useLocation();
  const outlet = useOutlet();
  // 2 tab feed dùng chung 1 khung -> không chạy hiệu ứng chuyển trang giữa chúng
  const key = location.pathname === '/following' ? '/' : location.pathname;
  return (
    <div className="flex h-dvh flex-col">
      <Header />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="relative min-w-0 flex-1 overflow-y-auto overflow-x-hidden">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={key}
              className="h-full"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.28, ease: [0.2, 0.8, 0.2, 1] }}
            >
              {outlet}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
      <BottomNav />
    </div>
  );
}

function NotFound() {
  return (
    <div className="grid h-full place-items-center text-center">
      <div>
        <p className="font-mono text-8xl font-bold text-lime">404</p>
        <p className="mt-3 text-2xl font-extrabold">Trang này không tồn tại</p>
        <Link to="/" className="btn mt-6">Về trang chủ</Link>
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
        <Route path="/upload" element={<PrivateRoute><Upload /></PrivateRoute>} />
        <Route path="/admin/*" element={<PrivateRoute role="admin"><Admin /></PrivateRoute>} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
