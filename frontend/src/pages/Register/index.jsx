import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import Button from '../../components/common/Button';
import useAuth from '../../hooks/useAuth';
import { errMsg } from '../../api/axiosClient';
import { AuthShell, Field } from '../Login';

export default function Register() {
  const { signUp } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm();

  const onSubmit = async ({ username, email, password }) => {
    try {
      const user = await signUp(username, email, password);
      toast(`Chào @${user.username}! Tài khoản đã sẵn sàng`, { icon: '🎉' });
      navigate(location.state?.from || '/', { replace: true });
    } catch (e) {
      toast.error(errMsg(e, 'Đăng ký thất bại'));
    }
  };

  return (
    <AuthShell title="Tạo tài khoản" subtitle="Một phút thôi. Sau đó đăng video và để AI dịch sang 10 ngôn ngữ.">
      <form onSubmit={handleSubmit(onSubmit)} className="mt-8 space-y-5" noValidate>
        {/* Khớp Joi: username alphanum 3–30, email, password ≥ 6 */}
        <Field label="Tên người dùng" autoComplete="username" placeholder="lapbuilds" error={errors.username?.message}
          {...register('username', {
            required: 'Nhập tên người dùng',
            minLength: { value: 3, message: 'Tối thiểu 3 ký tự' },
            maxLength: { value: 30, message: 'Tối đa 30 ký tự' },
            pattern: { value: /^[a-zA-Z0-9]+$/, message: 'Chỉ dùng chữ và số, không dấu' },
          })} />
        <Field label="Email" type="email" autoComplete="email" placeholder="ban@email.com" error={errors.email?.message}
          {...register('email', { required: 'Nhập email', pattern: { value: /\S+@\S+\.\S+/, message: 'Email không hợp lệ' } })} />
        <Field label="Mật khẩu" type="password" autoComplete="new-password" placeholder="Ít nhất 6 ký tự" error={errors.password?.message}
          {...register('password', { required: 'Nhập mật khẩu', minLength: { value: 6, message: 'Tối thiểu 6 ký tự' } })} />
        <Field label="Nhập lại mật khẩu" type="password" autoComplete="new-password" placeholder="••••••" error={errors.confirm?.message}
          {...register('confirm', { validate: (v) => v === watch('password') || 'Mật khẩu không khớp' })} />
        <Button type="submit" loading={isSubmitting} className="w-full !py-3.5 text-[16px]">Đăng ký</Button>
      </form>
      <p className="mt-6 text-center text-paper-dim">
        Đã có tài khoản? <Link to="/login" state={location.state} className="font-bold text-paper underline decoration-lime decoration-2 underline-offset-4">Đăng nhập</Link>
      </p>
    </AuthShell>
  );
}
