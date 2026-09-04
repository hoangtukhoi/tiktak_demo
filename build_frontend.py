import os
import json

base_dir = r"F:\tiktak\frontend"

files = {
    "package.json": """{
  "name": "tiktak-frontend",
  "version": "1.0.0",
  "private": true,
  "scripts": { "dev": "vite", "build": "vite build", "preview": "vite preview" },
  "dependencies": {
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "react-router-dom": "^6.23.0",
    "zustand": "^4.5.0",
    "axios": "^1.7.3",
    "socket.io-client": "^4.7.5",
    "hls.js": "^1.5.13",
    "framer-motion": "^11.3.0",
    "lucide-react": "^0.400.0",
    "react-hot-toast": "^2.4.1",
    "react-hook-form": "^7.52.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.0",
    "vite": "^5.3.0",
    "tailwindcss": "^3.4.0",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.4.0"
  }
}""",
    "vite.config.js": """import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:5000'
    }
  }
});""",
    "tailwind.config.js": """/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          from: '#7c3aed',
          to: '#ec4899',
        }
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
      keyframes: {
        'slide-up': {
          '0%': { transform: 'translateY(100%)' },
          '100%': { transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        }
      },
      animation: {
        'slide-up': 'slide-up 0.3s ease-out',
        'fade-in': 'fade-in 0.3s ease-out',
      }
    },
  },
  plugins: [],
}""",
    "postcss.config.js": """export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}""",
    "index.html": """<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
    <title>TikTak</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>""",
    "src/main.jsx": """import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
      <Toaster position="top-center" toastOptions={{ style: { background: '#1e1e1e', color: '#fff' } }} />
    </BrowserRouter>
  </React.StrictMode>
);""",
    "src/App.jsx": """import React, { useEffect } from 'react';
import AppRouter from './routes/AppRouter';
import useAuthStore from './store/slices/authSlice';
import { getMe } from './api/auth.api';
import { connectSocket, disconnectSocket } from './services/socket.service';

export default function App() {
  const { setAuth, clearAuth, isAuthenticated } = useAuthStore();

  useEffect(() => {
    const initAuth = async () => {
      const token = localStorage.getItem('accessToken');
      if (token) {
        try {
          const user = await getMe();
          setAuth(user, token, localStorage.getItem('refreshToken'));
        } catch (error) {
          clearAuth();
        }
      }
    };
    initAuth();
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      connectSocket(localStorage.getItem('accessToken'));
    } else {
      disconnectSocket();
    }
    return () => disconnectSocket();
  }, [isAuthenticated]);

  return <AppRouter />;
}""",
    "src/index.css": """@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
@tailwind base;
@tailwind components;
@tailwind utilities;

* { font-family: 'Inter', sans-serif; box-sizing: border-box; }
body { background: #0a0a0a; color: white; margin: 0; overflow-x: hidden; }

.feed-container { height: 100dvh; overflow-y: scroll; scroll-snap-type: y mandatory; scrollbar-width: none; }
.feed-container::-webkit-scrollbar { display: none; }
.feed-item { height: 100dvh; scroll-snap-align: start; position: relative; overflow: hidden; }

.glass { background: rgba(0,0,0,0.6); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.08); }
.gradient-text { background: linear-gradient(135deg, #7c3aed, #ec4899); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
.gradient-bg { background: linear-gradient(135deg, #7c3aed, #ec4899); }""",
    "src/api/axiosClient.js": """import axios from 'axios';
import useAuthStore from '../store/slices/authSlice';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  withCredentials: true,
});

api.interceptors.request.use(config => {
  const token = localStorage.getItem('accessToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  res => res,
  async error => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      try {
        const refreshToken = localStorage.getItem('refreshToken');
        const { data } = await axios.post('/api/auth/refresh', { refreshToken });
        localStorage.setItem('accessToken', data.data.accessToken);
        original.headers.Authorization = `Bearer ${data.data.accessToken}`;
        return api(original);
      } catch {
        localStorage.clear();
        useAuthStore.getState().clearAuth();
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);
export default api;""",
    "src/api/auth.api.js": """import api from './axiosClient';
export const login = (email, password) => api.post('/auth/login', { email, password }).then(r => r.data.data);
export const register = (username, email, password) => api.post('/auth/register', { username, email, password }).then(r => r.data.data);
export const logout = (refreshToken) => api.post('/auth/logout', { refreshToken });
export const getMe = () => api.get('/auth/me').then(r => r.data.data);
export const refresh = (refreshToken) => api.post('/auth/refresh', { refreshToken }).then(r => r.data.data);""",
    "src/api/video.api.js": """import api from './axiosClient';
export const getForYouFeed = (cursor) => api.get('/feed/for-you', { params: { cursor } }).then(r => r.data.data);
export const getFollowingFeed = (cursor) => api.get('/feed/following', { params: { cursor } }).then(r => r.data.data);
export const getVideo = (id) => api.get(`/videos/${id}`).then(r => r.data.data);
export const likeVideo = (id) => api.post(`/videos/${id}/like`).then(r => r.data.data);
export const recordView = (id, watchTimeMs) => api.post(`/videos/${id}/view`, { watchTimeMs });
export const createVideo = (data) => api.post('/videos', data).then(r => r.data.data);
export const uploadVideoFile = (formData, onProgress) => api.post('/upload', formData, {
  headers: { 'Content-Type': 'multipart/form-data' },
  onUploadProgress: e => onProgress?.(Math.round((e.loaded / e.total) * 100)),
}).then(r => r.data.data);
export const getProgressSSE = (jobId, onProgress, onDone) => {
  const es = new EventSource(`/api/upload/${jobId}/progress`);
  es.onmessage = e => { const d = JSON.parse(e.data); onProgress?.(d); if (d.status === 'completed' || d.status === 'failed') { onDone?.(d); es.close(); } };
  return es;
};
export const getUserVideos = (userId, cursor) => api.get(`/users/${userId}/videos`, { params: { cursor } }).then(r => r.data.data);
export const searchVideos = (q, page) => api.get('/videos/search', { params: { q, page } }).then(r => r.data);
export const deleteVideo = (id) => api.delete(`/videos/${id}`);""",
    "src/api/dubbing.api.js": """import api from './axiosClient';
export const requestDubbing = (videoId, targetLang, sourceLang) => api.post('/dubbing/request', { videoId, targetLang, sourceLang }).then(r => r.data.data);
export const getDubbingStatus = (trackId) => api.get(`/dubbing/${trackId}/status`).then(r => r.data.data);
export const getVideoTracks = (videoId) => api.get(`/dubbing/video/${videoId}`).then(r => r.data.data);
export const getSupportedLanguages = () => api.get('/dubbing/languages').then(r => r.data.data);""",
    "src/api/notification.api.js": """import api from './axiosClient';
export const getNotifications = (page) => api.get('/notifications', { params: { page } }).then(r => r.data);
export const markAsRead = (id) => api.patch(`/notifications/${id}/read`);
export const markAllAsRead = () => api.patch('/notifications/read-all');
export const getUnreadCount = () => api.get('/notifications/unread-count').then(r => r.data.data);""",
    "src/store/slices/authSlice.js": """import { create } from 'zustand';
import { persist } from 'zustand/middleware';
const useAuthStore = create(persist(
  (set) => ({
    user: null,
    isAuthenticated: false,
    setAuth: (user, accessToken, refreshToken) => {
      localStorage.setItem('accessToken', accessToken);
      localStorage.setItem('refreshToken', refreshToken);
      set({ user, isAuthenticated: true });
    },
    setUser: (user) => set({ user }),
    clearAuth: () => {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      set({ user: null, isAuthenticated: false });
    },
  }),
  { name: 'auth', partialize: s => ({ user: s.user, isAuthenticated: s.isAuthenticated }) }
));
export default useAuthStore;""",
    "src/store/slices/videoSlice.js": """import { create } from 'zustand';
import { persist } from 'zustand/middleware';
const useVideoStore = create(persist(
  (set) => ({ isMuted: true, volume: 0.8, currentVideoId: null,
    toggleMute: () => set(s => ({ isMuted: !s.isMuted })),
    setVolume: (v) => set({ volume: v }),
    setCurrentVideoId: (id) => set({ currentVideoId: id }),
  }),
  { name: 'video-prefs', partialize: s => ({ isMuted: s.isMuted, volume: s.volume }) }
));
export default useVideoStore;""",
    "src/store/slices/notificationSlice.js": """import { create } from 'zustand';
const useNotificationStore = create(set => ({
  notifications: [], unreadCount: 0,
  addNotification: (n) => set(s => ({ notifications: [n, ...s.notifications], unreadCount: s.unreadCount + 1 })),
  setUnreadCount: (n) => set({ unreadCount: n }),
  markRead: () => set({ unreadCount: 0 }),
}));
export default useNotificationStore;""",
    "src/store/index.js": """export { default as useAuthStore } from './slices/authSlice';
export { default as useVideoStore } from './slices/videoSlice';
export { default as useNotificationStore } from './slices/notificationSlice';""",
    "src/hooks/useAuth.js": """import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import useAuthStore from '../store/slices/authSlice';
import * as authApi from '../api/auth.api';

export default function useAuth() {
  const { user, isAuthenticated, setAuth, clearAuth } = useAuthStore();
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const login = async (email, password) => {
    setIsLoading(true);
    try {
      const data = await authApi.login(email, password);
      setAuth(data.user, data.accessToken, data.refreshToken);
      toast.success('Đăng nhập thành công!');
      navigate('/');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Đăng nhập thất bại');
    } finally { setIsLoading(false); }
  };

  const register = async (username, email, password) => {
    setIsLoading(true);
    try {
      const data = await authApi.register(username, email, password);
      setAuth(data.user, data.accessToken, data.refreshToken);
      toast.success('Đăng ký thành công!');
      navigate('/');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Đăng ký thất bại');
    } finally { setIsLoading(false); }
  };

  const logout = async () => {
    try {
      await authApi.logout(localStorage.getItem('refreshToken'));
    } finally {
      clearAuth();
      navigate('/login');
    }
  };

  return { user, isAuthenticated, isLoading, login, register, logout };
}""",
    "src/hooks/useInfiniteScroll.js": """import { useEffect, useRef } from 'react';
export default function useInfiniteScroll(onEndReached, hasMore) {
  const sentinelRef = useRef(null);
  useEffect(() => {
    if (!hasMore) return;
    const obs = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) onEndReached(); }, { threshold: 0.1 });
    if (sentinelRef.current) obs.observe(sentinelRef.current);
    return () => obs.disconnect();
  }, [onEndReached, hasMore]);
  return sentinelRef;
}""",
    "src/hooks/useVideoPlayer.js": """import { useRef, useState, useEffect, useCallback } from 'react';
import Hls from 'hls.js';
import { recordView } from '../api/video.api';
import useVideoStore from '../store/slices/videoSlice';

export default function useVideoPlayer(videoId) {
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const watchStartRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isBuffering, setIsBuffering] = useState(true);
  const { isMuted, volume, toggleMute } = useVideoStore();

  const initHls = useCallback((src) => {
    const video = videoRef.current;
    if (!video || !src) return;
    if (src.endsWith('.m3u8') && Hls.isSupported()) {
      if (hlsRef.current) hlsRef.current.destroy();
      const hls = new Hls();
      hls.loadSource(src);
      hls.attachMedia(video);
      hlsRef.current = hls;
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src;
    } else {
      video.src = src;
    }
  }, []);

  const play = useCallback(() => {
    videoRef.current?.play();
    watchStartRef.current = Date.now();
  }, []);

  const pause = useCallback(() => {
    videoRef.current?.pause();
    if (watchStartRef.current && videoId) {
      const watched = Date.now() - watchStartRef.current;
      if (watched > 3000) recordView(videoId, watched).catch(() => {});
      watchStartRef.current = null;
    }
  }, [videoId]);

  const togglePlay = useCallback(() => {
    if (videoRef.current?.paused) play(); else pause();
  }, [play, pause]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onTimeUpdate = () => setCurrentTime(video.currentTime);
    const onLoadedMetadata = () => { setDuration(video.duration); setIsBuffering(false); };
    const onWaiting = () => setIsBuffering(true);
    const onCanPlay = () => setIsBuffering(false);
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('loadedmetadata', onLoadedMetadata);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('canplay', onCanPlay);
    return () => {
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('canplay', onCanPlay);
      hlsRef.current?.destroy();
    };
  }, []);

  return { videoRef, isPlaying, currentTime, duration, isBuffering, isMuted, volume, initHls, play, pause, togglePlay, toggleMute };
}""",
    "src/services/socket.service.js": """import { io } from 'socket.io-client';
import useNotificationStore from '../store/slices/notificationSlice';

let socket;
export const connectSocket = (token) => {
  if (socket?.connected) return;
  socket = io(import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:5000', {
    auth: { token },
    transports: ['websocket'],
  });
  socket.on('connect', () => console.log('Socket connected'));
  socket.on('disconnect', () => console.log('Socket disconnected'));
  socket.on('notification', (data) => {
    useNotificationStore.getState().addNotification(data);
  });
};
export const disconnectSocket = () => { socket?.disconnect(); socket = null; };
export const getSocket = () => socket;""",
    "src/utils/format.js": """export const formatCount = (n) => n >= 1e6 ? `${(n/1e6).toFixed(1)}M` : n >= 1e3 ? `${(n/1e3).toFixed(1)}K` : String(n);
export const formatDuration = (ms) => { const s = Math.floor(ms/1000); const m = Math.floor(s/60); const sec = s%60; return `${m}:${String(sec).padStart(2,'0')}`; };
export const timeAgo = (dateStr) => {
  const diff = Date.now() - new Date(dateStr);
  const s = diff/1000, m = s/60, h = m/60, d = h/24;
  if (s < 60) return 'Vừa xong';
  if (m < 60) return `${Math.floor(m)} phút trước`;
  if (h < 24) return `${Math.floor(h)} giờ trước`;
  if (d < 7) return `${Math.floor(d)} ngày trước`;
  return new Date(dateStr).toLocaleDateString('vi-VN');
};""",
    "src/utils/constants.js": """export const ROUTES = { HOME: '/', LOGIN: '/login', REGISTER: '/register', PROFILE: '/profile', UPLOAD: '/upload', WATCH: '/watch', SEARCH: '/search', ADMIN: '/admin' };""",
    "src/routes/PrivateRoute.jsx": """import { Navigate } from 'react-router-dom';
import useAuthStore from '../store/slices/authSlice';
export default function PrivateRoute({ children }) {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  return isAuthenticated ? children : <Navigate to="/login" replace />;
}""",
    "src/routes/AppRouter.jsx": """import { Routes, Route } from 'react-router-dom';
import PrivateRoute from './PrivateRoute';
import Home from '../pages/Home';
import Login from '../pages/Login';
import Register from '../pages/Register';
import Profile from '../pages/Profile';
import Upload from '../pages/Upload';
import VideoDetail from '../pages/VideoDetail';
import Search from '../pages/Search';
import Admin from '../pages/Admin';

export default function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/profile/:username" element={<Profile />} />
      <Route path="/watch/:id" element={<VideoDetail />} />
      <Route path="/search" element={<Search />} />
      <Route path="/upload" element={<PrivateRoute><Upload /></PrivateRoute>} />
      <Route path="/admin/*" element={<PrivateRoute><Admin /></PrivateRoute>} />
    </Routes>
  );
}""",
    "src/components/common/Spinner.jsx": """export default function Spinner({ size = 'md' }) {
  const sizeClasses = { sm: 'h-4 w-4', md: 'h-8 w-8', lg: 'h-12 w-12' };
  return (
    <div className={`animate-spin rounded-full border-2 border-white/20 border-t-brand-from ${sizeClasses[size]}`} />
  );
}""",
    "src/components/common/Avatar.jsx": """export default function Avatar({ src, username = 'User', size = 'md', className = '' }) {
  const sizeClasses = { sm: 'h-8 w-8 text-sm', md: 'h-10 w-10 text-base', lg: 'h-16 w-16 text-xl', xl: 'h-24 w-24 text-3xl' };
  return (
    <div className={`rounded-full overflow-hidden flex items-center justify-center shrink-0 ${sizeClasses[size]} ${className} ${!src ? 'gradient-bg font-bold' : ''}`}>
      {src ? <img src={src} alt={username} className="w-full h-full object-cover" /> : username.charAt(0).toUpperCase()}
    </div>
  );
}""",
    "src/components/common/Button.jsx": """export default function Button({ children, variant = 'primary', size = 'md', loading = false, className = '', ...props }) {
  const base = 'inline-flex items-center justify-center font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
  const variants = {
    primary: 'bg-brand-from hover:bg-brand-to text-white',
    ghost: 'bg-transparent hover:bg-white/10 text-white',
    danger: 'bg-red-500 hover:bg-red-600 text-white'
  };
  const sizes = { sm: 'px-3 py-1.5 text-sm', md: 'px-4 py-2 text-base', lg: 'px-6 py-3 text-lg' };
  return (
    <button className={`${base} ${variants[variant]} ${sizes[size]} ${className}`} disabled={loading || props.disabled} {...props}>
      {loading ? <span className="mr-2 animate-spin rounded-full h-4 w-4 border-2 border-white/20 border-t-white" /> : null}
      {children}
    </button>
  );
}""",
    "src/components/common/Modal.jsx": """import { X } from 'lucide-react';
export default function Modal({ isOpen, onClose, title, children }) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative glass w-full max-w-md rounded-xl p-6 shadow-xl animate-fade-in">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">{title}</h2>
          <button onClick={onClose} className="p-1 hover:bg-white/10 rounded-full transition-colors"><X className="w-5 h-5" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}""",
    "src/components/layout/Header.jsx": """import { Search, Plus, Bell, Menu } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import Avatar from '../common/Avatar';
import useAuthStore from '../../store/slices/authSlice';
export default function Header() {
  const { user, isAuthenticated } = useAuthStore();
  const navigate = useNavigate();
  return (
    <header className="fixed top-0 left-0 right-0 h-16 glass z-40 flex items-center justify-between px-4 lg:px-8">
      <Link to="/" className="text-2xl font-bold gradient-text tracking-tighter">TikTak</Link>
      <div className="hidden md:flex items-center flex-1 max-w-md mx-8 relative">
        <input type="text" placeholder="Tìm kiếm..." className="w-full bg-white/10 border border-white/10 rounded-full py-2 pl-4 pr-10 focus:outline-none focus:border-brand-from transition-colors" onKeyDown={e => e.key === 'Enter' && navigate(`/search?q=${e.target.value}`)} />
        <Search className="absolute right-3 top-2.5 w-5 h-5 text-gray-400" />
      </div>
      <div className="flex items-center gap-4">
        {isAuthenticated ? (
          <>
            <Link to="/upload" className="hidden sm:flex items-center gap-2 bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg transition-colors"><Plus className="w-5 h-5" /> <span>Tải lên</span></Link>
            <button className="p-2 hover:bg-white/10 rounded-full"><Bell className="w-6 h-6" /></button>
            <Link to={`/profile/${user?.username}`}><Avatar src={user?.avatar} username={user?.username} size="sm" /></Link>
          </>
        ) : (
          <Link to="/login" className="bg-brand-from hover:bg-brand-to px-4 py-2 rounded-lg font-medium transition-colors">Đăng nhập</Link>
        )}
      </div>
    </header>
  );
}""",
    "src/components/layout/Sidebar.jsx": """import { Home, Compass, Users, Plus, User } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import useAuthStore from '../../store/slices/authSlice';
import Avatar from '../common/Avatar';
export default function Sidebar() {
  const { user, isAuthenticated } = useAuthStore();
  const links = [
    { to: '/', icon: Home, label: 'Trang chủ' },
    { to: '/search', icon: Compass, label: 'Khám phá' },
    { to: '/following', icon: Users, label: 'Đang theo dõi' },
  ];
  return (
    <aside className="hidden lg:flex flex-col w-64 h-[calc(100vh-4rem)] fixed top-16 left-0 border-r border-white/10 p-4 overflow-y-auto">
      <nav className="flex flex-col gap-2">
        {links.map(l => (
          <NavLink key={l.to} to={l.to} className={({isActive}) => `flex items-center gap-3 p-3 rounded-lg transition-colors ${isActive ? 'bg-white/10 font-bold' : 'hover:bg-white/5'}`}>
            <l.icon className="w-6 h-6" /> <span className="text-lg">{l.label}</span>
          </NavLink>
        ))}
      </nav>
      {isAuthenticated && (
        <div className="mt-auto pt-4 border-t border-white/10 flex items-center gap-3 p-2">
          <Avatar src={user?.avatar} username={user?.username} size="md" />
          <div className="flex flex-col overflow-hidden">
            <span className="font-semibold truncate">{user?.username}</span>
            <span className="text-sm text-gray-400 truncate">{user?.email}</span>
          </div>
        </div>
      )}
    </aside>
  );
}""",
    "src/components/layout/BottomNav.jsx": """import { Home, Search, PlusSquare, User } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import useAuthStore from '../../store/slices/authSlice';
export default function BottomNav() {
  const { user } = useAuthStore();
  return (
    <nav className="sm:hidden fixed bottom-0 left-0 right-0 h-14 glass z-40 flex items-center justify-around px-2 border-t border-white/10">
      <NavLink to="/" className={({isActive}) => `p-2 ${isActive ? 'text-brand-from' : 'text-gray-400'}`}><Home className="w-6 h-6" /></NavLink>
      <NavLink to="/search" className={({isActive}) => `p-2 ${isActive ? 'text-brand-from' : 'text-gray-400'}`}><Search className="w-6 h-6" /></NavLink>
      <NavLink to="/upload" className="p-2"><PlusSquare className="w-8 h-8 text-white" /></NavLink>
      <NavLink to={user ? `/profile/${user.username}` : '/login'} className={({isActive}) => `p-2 ${isActive ? 'text-brand-from' : 'text-gray-400'}`}><User className="w-6 h-6" /></NavLink>
    </nav>
  );
}""",
    "src/components/video/VideoPlayer.jsx": """import { useEffect } from 'react';
import { Play, Volume2, VolumeX } from 'lucide-react';
import useVideoPlayer from '../../hooks/useVideoPlayer';
import Spinner from '../common/Spinner';
export default function VideoPlayer({ src, poster, autoPlay, isActive, videoId }) {
  const { videoRef, isPlaying, isBuffering, isMuted, initHls, togglePlay, toggleMute, play, pause } = useVideoPlayer(videoId);
  
  useEffect(() => {
    if (isActive) initHls(src);
  }, [isActive, src, initHls]);

  useEffect(() => {
    if (isActive && autoPlay) {
      play();
    } else {
      pause();
    }
  }, [isActive, autoPlay, play, pause]);

  return (
    <div className="relative w-full h-full bg-black group" onClick={togglePlay}>
      <video ref={videoRef} poster={poster} muted={isMuted} loop playsInline className="w-full h-full object-cover" />
      {isBuffering && <div className="absolute inset-0 flex items-center justify-center bg-black/20"><Spinner size="lg" /></div>}
      {!isPlaying && !isBuffering && <div className="absolute inset-0 flex items-center justify-center bg-black/20"><Play className="w-16 h-16 text-white/80" fill="currentColor" /></div>}
      <button onClick={(e) => { e.stopPropagation(); toggleMute(); }} className="absolute bottom-4 right-4 p-2 rounded-full bg-black/40 hover:bg-black/60 transition opacity-0 group-hover:opacity-100">
        {isMuted ? <VolumeX className="w-6 h-6" /> : <Volume2 className="w-6 h-6" />}
      </button>
    </div>
  );
}""",
    "src/components/video/ActionButtons.jsx": """import { Heart, MessageCircle, Share2, Languages } from 'lucide-react';
import { formatCount } from '../../utils/format';
export default function ActionButtons({ video, onLike, onComment, onShare, onDubbing }) {
  return (
    <div className="absolute right-4 bottom-20 flex flex-col gap-6 items-center">
      <button onClick={onLike} className="flex flex-col items-center group">
        <div className="p-3 rounded-full bg-black/40 group-hover:bg-black/60 transition"><Heart className={`w-7 h-7 ${video.isLiked ? 'text-red-500 fill-current' : 'text-white'}`} /></div>
        <span className="text-sm font-semibold mt-1">{formatCount(video.likesCount || 0)}</span>
      </button>
      <button onClick={onComment} className="flex flex-col items-center group">
        <div className="p-3 rounded-full bg-black/40 group-hover:bg-black/60 transition"><MessageCircle className="w-7 h-7 text-white" /></div>
        <span className="text-sm font-semibold mt-1">{formatCount(video.commentsCount || 0)}</span>
      </button>
      <button onClick={onDubbing} className="flex flex-col items-center group">
        <div className="p-3 rounded-full bg-black/40 group-hover:bg-black/60 transition"><Languages className="w-7 h-7 text-white" /></div>
        <span className="text-sm font-semibold mt-1">Dịch</span>
      </button>
      <button onClick={onShare} className="flex flex-col items-center group">
        <div className="p-3 rounded-full bg-black/40 group-hover:bg-black/60 transition"><Share2 className="w-7 h-7 text-white" /></div>
        <span className="text-sm font-semibold mt-1">{formatCount(video.sharesCount || 0)}</span>
      </button>
    </div>
  );
}""",
    "src/components/video/VideoCard.jsx": """import { useState } from 'react';
import { motion } from 'framer-motion';
import VideoPlayer from './VideoPlayer';
import ActionButtons from './ActionButtons';
import Avatar from '../common/Avatar';
export default function VideoCard({ video, isActive }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full h-full relative bg-black">
      <VideoPlayer src={video.videoUrl} poster={video.thumbnailUrl} autoPlay={true} isActive={isActive} videoId={video._id} />
      <ActionButtons video={video} onLike={() => {}} onComment={() => {}} onShare={() => {}} onDubbing={() => {}} />
      <div className="absolute bottom-0 left-0 right-16 p-4 pt-10 bg-gradient-to-t from-black/80 to-transparent pointer-events-none">
        <div className="flex items-center gap-3 mb-2 pointer-events-auto">
          <Avatar src={video.author?.avatar} username={video.author?.username} size="md" />
          <div>
            <h3 className="font-bold text-lg hover:underline cursor-pointer">{video.author?.username}</h3>
          </div>
        </div>
        <p className="text-sm mb-2">{video.title}</p>
        <p className="text-sm text-gray-300 pointer-events-auto">
          {video.hashtags?.map(tag => <span key={tag} className="font-semibold hover:underline cursor-pointer mr-1">#{tag}</span>)}
        </p>
      </div>
    </motion.div>
  );
}""",
    "src/components/video/VideoUploader.jsx": """import { useState, useRef } from 'react';
import { UploadCloud } from 'lucide-react';
export default function VideoUploader({ onFileSelect }) {
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef(null);
  
  const handleDrag = e => { e.preventDefault(); e.stopPropagation(); if(e.type === 'dragenter' || e.type === 'dragover') setDragActive(true); else setDragActive(false); };
  const handleDrop = e => { e.preventDefault(); e.stopPropagation(); setDragActive(false); if(e.dataTransfer.files && e.dataTransfer.files[0]) onFileSelect(e.dataTransfer.files[0]); };
  const handleChange = e => { e.preventDefault(); if(e.target.files && e.target.files[0]) onFileSelect(e.target.files[0]); };

  return (
    <div onDragEnter={handleDrag} onDragLeave={handleDrag} onDragOver={handleDrag} onDrop={handleDrop} className={`w-full max-w-2xl mx-auto h-80 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center p-6 text-center transition-colors ${dragActive ? 'border-brand-from bg-brand-from/10' : 'border-white/20 hover:border-white/40 hover:bg-white/5'}`}>
      <UploadCloud className="w-16 h-16 text-gray-400 mb-4" />
      <h3 className="text-xl font-bold mb-2">Chọn video để tải lên</h3>
      <p className="text-gray-400 mb-6">Hoặc kéo và thả tập tin vào đây</p>
      <p className="text-sm text-gray-500 mb-6">MP4 hoặc WebM<br/>Độ phân giải 720x1280 trở lên<br/>Tối đa 10 phút<br/>Nhỏ hơn 500 MB</p>
      <input ref={inputRef} type="file" accept="video/mp4,video/webm" onChange={handleChange} className="hidden" />
      <button onClick={() => inputRef.current?.click()} className="bg-brand-from hover:bg-brand-to text-white font-bold py-2 px-8 rounded-lg transition">Chọn tập tin</button>
    </div>
  );
}""",
    "src/pages/Home/index.jsx": """import { useState, useEffect, useRef } from 'react';
import Header from '../../components/layout/Header';
import Sidebar from '../../components/layout/Sidebar';
import BottomNav from '../../components/layout/BottomNav';
import VideoCard from '../../components/video/VideoCard';
import useInfiniteScroll from '../../hooks/useInfiniteScroll';
import { getForYouFeed } from '../../api/video.api';

export default function Home() {
  const [videos, setVideos] = useState([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef(null);

  useEffect(() => {
    getForYouFeed().then(data => setVideos(data.videos || [])).catch(console.error);
  }, []);

  const handleScroll = (e) => {
    const y = e.target.scrollTop;
    const h = e.target.clientHeight;
    const index = Math.round(y / h);
    if (index !== activeIndex) setActiveIndex(index);
  };

  return (
    <div className="h-screen w-screen flex flex-col">
      <Header />
      <div className="flex flex-1 pt-16 overflow-hidden">
        <Sidebar />
        <main className="flex-1 lg:ml-64 bg-black relative flex justify-center">
          <div ref={containerRef} onScroll={handleScroll} className="feed-container w-full max-w-[500px] h-full sm:rounded-lg sm:my-2 overflow-hidden">
            {videos.map((v, i) => (
              <div key={v._id} className="feed-item">
                <VideoCard video={v} isActive={i === activeIndex} />
              </div>
            ))}
          </div>
        </main>
      </div>
      <BottomNav />
    </div>
  );
}""",
    "src/pages/Login/index.jsx": """import { useState } from 'react';
import { Link } from 'react-router-dom';
import useAuth from '../../hooks/useAuth';
import Button from '../../components/common/Button';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { login, isLoading } = useAuth();

  const handleSubmit = (e) => { e.preventDefault(); login(email, password); };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md glass p-8 rounded-2xl animate-fade-in">
        <h1 className="text-3xl font-bold mb-8 text-center gradient-text">Đăng nhập TikTak</h1>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-300">Email</label>
            <input type="email" value={email} onChange={e=>setEmail(e.target.value)} required className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 focus:outline-none focus:border-brand-from transition" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-300">Mật khẩu</label>
            <input type="password" value={password} onChange={e=>setPassword(e.target.value)} required className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 focus:outline-none focus:border-brand-from transition" />
          </div>
          <Button type="submit" loading={isLoading} className="mt-4 w-full">Đăng nhập</Button>
        </form>
        <p className="mt-6 text-center text-sm text-gray-400">
          Chưa có tài khoản? <Link to="/register" className="text-brand-from hover:underline font-medium">Đăng ký</Link>
        </p>
      </div>
    </div>
  );
}""",
    "src/pages/Register/index.jsx": """import { useState } from 'react';
import { Link } from 'react-router-dom';
import useAuth from '../../hooks/useAuth';
import Button from '../../components/common/Button';

export default function Register() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { register, isLoading } = useAuth();

  const handleSubmit = (e) => { e.preventDefault(); register(username, email, password); };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md glass p-8 rounded-2xl animate-fade-in">
        <h1 className="text-3xl font-bold mb-8 text-center gradient-text">Đăng ký TikTak</h1>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-300">Tên người dùng</label>
            <input type="text" value={username} onChange={e=>setUsername(e.target.value)} required className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 focus:outline-none focus:border-brand-from transition" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-300">Email</label>
            <input type="email" value={email} onChange={e=>setEmail(e.target.value)} required className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 focus:outline-none focus:border-brand-from transition" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-300">Mật khẩu</label>
            <input type="password" value={password} onChange={e=>setPassword(e.target.value)} required className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 focus:outline-none focus:border-brand-from transition" />
          </div>
          <Button type="submit" loading={isLoading} className="mt-4 w-full">Đăng ký</Button>
        </form>
        <p className="mt-6 text-center text-sm text-gray-400">
          Đã có tài khoản? <Link to="/login" className="text-brand-from hover:underline font-medium">Đăng nhập</Link>
        </p>
      </div>
    </div>
  );
}""",
    "src/pages/Profile/index.jsx": """import { useParams } from 'react-router-dom';
import Header from '../../components/layout/Header';
import Sidebar from '../../components/layout/Sidebar';
import Avatar from '../../components/common/Avatar';
import Button from '../../components/common/Button';
export default function Profile() {
  const { username } = useParams();
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <div className="flex flex-1 pt-16">
        <Sidebar />
        <main className="flex-1 lg:ml-64 p-8 max-w-4xl mx-auto w-full">
          <div className="flex items-start gap-8 mb-8">
            <Avatar size="xl" username={username} />
            <div>
              <h1 className="text-3xl font-bold mb-2">{username}</h1>
              <div className="flex gap-6 mb-4 text-gray-300">
                <span><strong className="text-white">0</strong> Đang theo dõi</span>
                <span><strong className="text-white">0</strong> Follower</span>
                <span><strong className="text-white">0</strong> Thích</span>
              </div>
              <Button>Theo dõi</Button>
            </div>
          </div>
          <div className="border-t border-white/10 pt-4">
            <h2 className="text-xl font-bold mb-4">Video</h2>
            <div className="grid grid-cols-3 gap-2 sm:gap-4">
              <div className="aspect-[3/4] bg-white/5 rounded-lg flex items-center justify-center text-gray-500">Trống</div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}""",
    "src/pages/Upload/index.jsx": """import { useState } from 'react';
import Header from '../../components/layout/Header';
import Sidebar from '../../components/layout/Sidebar';
import VideoUploader from '../../components/video/VideoUploader';
import Button from '../../components/common/Button';
import { uploadVideoFile, createVideo } from '../../api/video.api';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

export default function Upload() {
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState('');
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const navigate = useNavigate();

  const handleUpload = async () => {
    if (!file || !title) return toast.error('Vui lòng chọn video và nhập tiêu đề');
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('video', file);
      const res = await uploadVideoFile(formData, setProgress);
      await createVideo({ title, originalUrl: res.url });
      toast.success('Tải lên thành công!');
      navigate('/');
    } catch (err) {
      toast.error('Lỗi tải lên');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <div className="flex flex-1 pt-16">
        <Sidebar />
        <main className="flex-1 lg:ml-64 p-8 bg-white/5">
          <div className="max-w-4xl mx-auto glass p-8 rounded-2xl">
            <h1 className="text-2xl font-bold mb-6">Tải lên video</h1>
            {!file ? (
              <VideoUploader onFileSelect={setFile} />
            ) : (
              <div className="flex flex-col gap-6">
                <div className="flex gap-4 items-center">
                  <div className="w-32 h-48 bg-black rounded-lg flex items-center justify-center text-sm">Preview</div>
                  <div className="flex-1">
                    <p className="font-semibold mb-1">{file.name}</p>
                    <p className="text-sm text-gray-400">{(file.size/1024/1024).toFixed(2)} MB</p>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Tiêu đề</label>
                  <input type="text" value={title} onChange={e=>setTitle(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 focus:outline-none focus:border-brand-from" />
                </div>
                {uploading && (
                  <div className="w-full bg-white/10 rounded-full h-2.5">
                    <div className="bg-brand-from h-2.5 rounded-full transition-all" style={{width: `${progress}%`}}></div>
                  </div>
                )}
                <div className="flex gap-4 justify-end mt-4">
                  <Button variant="ghost" onClick={() => setFile(null)} disabled={uploading}>Hủy</Button>
                  <Button onClick={handleUpload} loading={uploading}>Đăng</Button>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}""",
    "src/pages/VideoDetail/index.jsx": """import { useParams } from 'react-router-dom';
import Header from '../../components/layout/Header';
export default function VideoDetail() {
  const { id } = useParams();
  return (
    <div className="h-screen flex flex-col">
      <Header />
      <div className="flex-1 flex pt-16 bg-black">
        <div className="flex-[2] relative">
          <div className="absolute inset-0 flex items-center justify-center text-white/50">Video Player {id}</div>
        </div>
        <div className="flex-1 glass border-l border-white/10 p-4">
          <h2 className="text-xl font-bold mb-4">Bình luận</h2>
        </div>
      </div>
    </div>
  );
}""",
    "src/pages/Search/index.jsx": """import { useSearchParams } from 'react-router-dom';
import Header from '../../components/layout/Header';
import Sidebar from '../../components/layout/Sidebar';
export default function Search() {
  const [searchParams] = useSearchParams();
  const q = searchParams.get('q');
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <div className="flex flex-1 pt-16">
        <Sidebar />
        <main className="flex-1 lg:ml-64 p-8">
          <h1 className="text-2xl font-bold mb-6">Kết quả cho: {q}</h1>
        </main>
      </div>
    </div>
  );
}""",
    "src/pages/Admin/index.jsx": """export default function Admin() {
  return (
    <div className="min-h-screen p-8 text-center">
      <h1 className="text-3xl font-bold text-brand-from">Admin Dashboard</h1>
      <p className="mt-4 text-gray-400">Coming soon...</p>
    </div>
  );
}"""
}

for path, content in files.items():
    full_path = os.path.join(base_dir, path)
    os.makedirs(os.path.dirname(full_path), exist_ok=True)
    with open(full_path, "w", encoding="utf-8") as f:
        f.write(content.strip())
print("Success")
