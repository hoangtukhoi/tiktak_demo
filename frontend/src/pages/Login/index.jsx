import { forwardRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { AnimatePresence, motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { ArrowLeft } from 'lucide-react';
import Button from '../../components/common/Button';
import Logo from '../../components/common/Logo';
import useAuth from '../../hooks/useAuth';
import { errMsg, USE_MOCK } from '../../api/axiosClient';

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
      <form onSubmit={handleSubmit(onSubmit)} className="mt-8 space-y-5" noValidate>
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
