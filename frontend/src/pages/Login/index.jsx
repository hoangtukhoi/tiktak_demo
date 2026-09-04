import { useState } from 'react';
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
}
