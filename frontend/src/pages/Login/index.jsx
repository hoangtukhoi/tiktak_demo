import { forwardRef, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { AnimatePresence, motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { ArrowLeft } from 'lucide-react';
import Button from '../../components/common/Button';
import Logo from '../../components/common/Logo';
import useAuth from '../../hooks/useAuth';
import { errMsg, USE_MOCK } from '../../api/axiosClient';
import { getGoogleStatus, googleLoginUrl } from '../../api/auth.api';

/** Khung chung cho Đăng nhập / Đăng ký */
export function AuthShell({ title, subtitle, children }) {
  return (
    <div className="flex h-dvh flex-col overflow-y-auto bg-bg">
      <header className="flex h-16 shrink-0 items-center justify-between px-5 lg:px-8">
        <Logo />
        <Link to="/" className="btn-ghost btn-sm text-fg-muted"><ArrowLeft size={16} /> Về trang chủ</Link>
      </header>
      <main className="flex flex-1 items-start justify-center px-5 pb-16 pt-6 sm:items-center sm:pt-0">
        <div className="w-full max-w-[380px]">
          <h1 className="text-2xl font-bold">{title}</h1>
          <p className="mt-1.5 text-fg-muted">{subtitle}</p>
          {children}
        </div>
      </main>
    </div>
  );
}

export const Field = forwardRef(function Field({ label, error, ...props }, ref) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <input ref={ref} className={`input ${error ? '!border-danger' : ''}`} {...props} />
      <AnimatePresence>
        {error && <motion.span initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-1 block text-sm text-danger">{error}</motion.span>}
      </AnimatePresence>
    </label>
  );
});

/** Chữ "G" nhiều màu kiểu nút đăng nhập Google chuẩn */
function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

/** Nút "Tiếp tục với Google" + đường kẻ "hoặc". Ẩn khi backend chưa cấu hình Google. */
export function GoogleLogin({ from = '/' }) {
  const [enabled, setEnabled] = useState(null);
  useEffect(() => {
    if (USE_MOCK) return setEnabled(false);
    getGoogleStatus().then((s) => setEnabled(Boolean(s?.enabled))).catch(() => setEnabled(false));
  }, []);
  if (!enabled) return null;
  return (
    <>
      <a href={googleLoginUrl(from)} className="btn-outline mt-8 !h-11 w-full">
        <GoogleMark /> Tiếp tục với Google
      </a>
      <div className="mt-5 flex items-center gap-3 text-xs text-fg-subtle">
        <span className="h-px flex-1 bg-line" /> hoặc <span className="h-px flex-1 bg-line" />
      </div>
    </>
  );
}

export default function Login() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm();

  const onSubmit = async ({ email, password }) => {
    try {
      const user = await signIn(email, password);
      toast(`Chào mừng trở lại, @${user.username}`);
      navigate(location.state?.from || '/', { replace: true });
    } catch (e) {
      toast.error(errMsg(e, 'Đăng nhập thất bại'));
    }
  };

  return (
    <AuthShell title="Chào mừng trở lại" subtitle="Đăng nhập để thả tim, bình luận và lồng tiếng video.">
      <GoogleLogin from={location.state?.from} />
      <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-5" noValidate>
        <Field label="Email" type="email" autoComplete="email" placeholder="ban@email.com" error={errors.email?.message}
          {...register('email', { required: 'Nhập email', pattern: { value: /\S+@\S+\.\S+/, message: 'Email không hợp lệ' } })} />
        <Field label="Mật khẩu" type="password" autoComplete="current-password" placeholder="••••••••" error={errors.password?.message}
          {...register('password', { required: 'Nhập mật khẩu' })} />
        <Button type="submit" loading={isSubmitting} className="w-full !h-11">Đăng nhập</Button>
      </form>
      <p className="mt-6 text-center text-fg-muted">
        Chưa có tài khoản? <Link to="/register" state={location.state} className="font-semibold text-brand-text hover:underline">Đăng ký</Link>
      </p>
      {USE_MOCK && <p className="mt-6 rounded bg-surface-2 px-4 py-3 text-xs text-fg-muted">Chế độ demo: nhập email bất kỳ. Email bắt đầu bằng <b className="text-fg">admin</b> sẽ có quyền quản trị.</p>}
    </AuthShell>
  );
}
