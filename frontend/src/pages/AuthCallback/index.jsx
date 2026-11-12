import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import Spinner from '../../components/common/Spinner';
import useAuth from '../../hooks/useAuth';
import { errMsg } from '../../api/axiosClient';
import { AuthShell } from '../Login';

const ERRORS = {
  cancelled: 'Bạn đã huỷ đăng nhập bằng Google.',
  state: 'Phiên đăng nhập không hợp lệ hoặc đã quá hạn. Hãy thử lại.',
  google_disabled: 'Máy chủ chưa bật đăng nhập Google (thiếu GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET).',
  email_unverified: 'Email Google của bạn chưa được xác minh, nên không thể liên kết với tài khoản sẵn có.',
  email_linked: 'Email này đã liên kết với một tài khoản Google khác.',
  no_email: 'Google không cung cấp email cho tài khoản này.',
  banned: 'Tài khoản đã bị khoá.',
};

/** Google chuyển về đây: /auth/callback?code=...&from=...  hoặc  ?error=... */
export default function AuthCallback() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { signInWithGoogleCode } = useAuth();
  const [error, setError] = useState(params.get('error') ? ERRORS[params.get('error')] || 'Đăng nhập Google thất bại. Hãy thử lại.' : '');
  const ran = useRef(false); // StrictMode gọi effect 2 lần, mà mã chỉ dùng được 1 lần

  useEffect(() => {
    const code = params.get('code');
    if (ran.current || !code || error) return;
    ran.current = true;
    const from = params.get('from') || '/';
    signInWithGoogleCode(code)
      .then((user) => {
        toast(`Xin chào, @${user.username}`, { icon: '👋' });
        // Chỉ quay về đường dẫn nội bộ
        navigate(from.startsWith('/') && !from.startsWith('//') ? from : '/', { replace: true });
      })
      .catch((e) => setError(errMsg(e, 'Đăng nhập Google thất bại. Hãy thử lại.')));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AuthShell title={error ? 'Chưa đăng nhập được' : 'Đang đăng nhập…'} subtitle={error || 'Đang xác nhận tài khoản Google của bạn.'}>
      {error ? (
        <Link to="/login" replace className="btn-primary mt-8 w-full !py-3.5">Quay lại đăng nhập</Link>
      ) : (
        <div className="mt-10 flex justify-center"><Spinner /></div>
      )}
    </AuthShell>
  );
}
