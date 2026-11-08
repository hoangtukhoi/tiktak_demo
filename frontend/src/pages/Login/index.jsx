import { forwardRef, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { AnimatePresence, motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { ArrowLeft } from 'lucide-react';
import Button from '../../components/common/Button';
import useAuth from '../../hooks/useAuth';
import { errMsg, USE_MOCK } from '../../api/axiosClient';
import { getGoogleStatus, googleLoginUrl } from '../../api/auth.api';

const WORDS = [['Xin chào', 'vi'], ['Hello', 'en'], ['こんにちは', 'ja'], ['안녕하세요', 'ko'], ['你好', 'zh'], ['Bonjour', 'fr'], ['Hola', 'es'], ['สวัสดี', 'th']];

function Rotator() {
  const [i, setI] = useState(0);
  useEffect(() => { const t = setInterval(() => setI((x) => (x + 1) % WORDS.length), 1800); return () => clearInterval(t); }, []);
  return (
    <span className="relative inline-flex h-[1.1em] overflow-hidden align-bottom text-lime">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span key={i} initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '-100%' }} transition={{ type: 'spring', damping: 22, stiffness: 220 }} className="block whitespace-nowrap">
          {WORDS[i][0]}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/** Khung chung cho Đăng nhập / Đăng ký */
export function AuthShell({ title, subtitle, children }) {
  return (
    <div className="grid h-dvh lg:grid-cols-[1.15fr_1fr]">
      <section className="grain relative hidden overflow-hidden bg-ink-800 p-12 lg:flex lg:flex-col">
        <Link to="/" className="flex items-center gap-2 text-2xl font-extrabold tracking-tightest">
          <span className="h-6 w-6 rounded-full bg-lime" /> tiktak
        </Link>
        <motion.div aria-hidden className="absolute -right-24 top-24 h-[420px] w-[420px] rounded-full border-[56px] border-lime/90"
          animate={{ rotate: 360 }} transition={{ duration: 40, repeat: Infinity, ease: 'linear' }}>
          <span className="absolute left-8 top-10 h-16 w-16 rounded-full bg-coral" />
        </motion.div>
        <div className="relative mt-auto">
          <p className="label mb-5">Video ngắn · AI lồng tiếng</p>
          <h1 className="text-[clamp(44px,5.6vw,84px)] font-extrabold">
            Nói <Rotator /><br />bằng bất kỳ<br />ngôn ngữ nào.
          </h1>
          <div className="mt-8 flex w-max animate-marquee gap-3 font-mono text-xs font-bold text-paper-dim">
            {[...WORDS, ...WORDS].map(([w, c], i) => <span key={i} className="rounded-full border border-ink-500 px-3 py-1">{c.toUpperCase()} · {w}</span>)}
          </div>
        </div>
      </section>

      <section className="flex flex-col overflow-y-auto px-6 py-8 sm:px-12">
        <Link to="/" className="inline-flex w-max items-center gap-2 text-sm font-semibold text-paper-dim hover:text-paper"><ArrowLeft size={16} /> Về trang chủ</Link>
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }} className="m-auto w-full max-w-[400px] py-10">
          <h2 className="text-4xl font-extrabold">{title}</h2>
          <p className="mt-2 text-paper-dim">{subtitle}</p>
          {children}
        </motion.div>
      </section>
    </div>
  );
}

export const Field = forwardRef(function Field({ label, error, ...props }, ref) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <input ref={ref} className={`input mt-2 ${error ? '!border-coral' : ''}`} {...props} />
      <AnimatePresence>
        {error && <motion.span initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-1.5 block text-sm font-semibold text-coral">{error}</motion.span>}
      </AnimatePresence>
    </label>
  );
});

/** Chữ "G" nhiều màu kiểu nút đăng nhập Google chuẩn */
function GoogleMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
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
      <a
        href={googleLoginUrl(from)}
        className="mt-8 flex w-full items-center justify-center gap-3 rounded-full border border-ink-500 bg-paper px-5 py-3.5 text-[16px] font-bold text-ink transition hover:bg-white"
      >
        <GoogleMark /> Tiếp tục với Google
      </a>
      <div className="mt-6 flex items-center gap-3 font-mono text-xs font-bold text-paper-mute">
        <span className="h-px flex-1 bg-ink-600" /> HOẶC <span className="h-px flex-1 bg-ink-600" />
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
      toast(`Chào mừng trở lại, @${user.username}`, { icon: '👋' });
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
        <Button type="submit" loading={isSubmitting} className="w-full !py-3.5 text-[16px]">Đăng nhập</Button>
      </form>
      <p className="mt-6 text-center text-paper-dim">
        Chưa có tài khoản? <Link to="/register" state={location.state} className="font-bold text-paper underline decoration-lime decoration-2 underline-offset-4">Đăng ký</Link>
      </p>
      {USE_MOCK && <p className="mt-6 rounded-2xl bg-ink-800 px-4 py-3 text-xs text-paper-dim">Chế độ demo: nhập email bất kỳ. Email bắt đầu bằng <b className="text-paper">admin</b> sẽ có quyền quản trị.</p>}
    </AuthShell>
  );
}
