import { Routes, Route } from 'react-router-dom';
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
}
