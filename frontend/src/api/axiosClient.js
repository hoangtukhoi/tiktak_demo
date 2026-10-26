import axios from 'axios';
import useAuthStore from '../store/slices/authSlice';

export const API_URL = import.meta.env.VITE_API_URL || '/api';
export const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true';

const api = axios.create({ baseURL: API_URL, withCredentials: true });

// Chế độ demo: thay adapter HTTP bằng backend giả trong trình duyệt (tải lười).
if (USE_MOCK) api.defaults.adapter = (cfg) => import('./mock').then((m) => m.default(cfg));

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Một lần refresh dùng chung cho mọi request 401 đồng thời.
let refreshing = null;
const refreshTokens = () => {
  refreshing ??= api
    .post('/auth/refresh', { refreshToken: localStorage.getItem('refreshToken') }, { _skipRefresh: true })
    .then(({ data }) => {
      // backend xoay vòng refresh token -> phải lưu cả hai
      localStorage.setItem('accessToken', data.data.accessToken);
      localStorage.setItem('refreshToken', data.data.refreshToken);
      return data.data.accessToken;
    })
    .finally(() => { refreshing = null; });
  return refreshing;
};

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config || {};
    const isAuthCall = original.url?.startsWith('/auth/');
    if (error.response?.status === 401 && !original._retry && !original._skipRefresh && !isAuthCall
        && localStorage.getItem('refreshToken')) {
      original._retry = true;
      try {
        const token = await refreshTokens();
        original.headers.Authorization = `Bearer ${token}`;
        return api(original);
      } catch {
        useAuthStore.getState().clearAuth();
        if (!location.pathname.startsWith('/login')) location.assign('/login');
      }
    }
    return Promise.reject(error);
  }
);

/** Lấy thông báo lỗi theo format backend: { success:false, message, errors? } */
export const errMsg = (e, fallback = 'Có lỗi xảy ra, thử lại sau') =>
  e?.response?.data?.errors?.[0] || e?.response?.data?.message || (e?.response ? fallback : 'Không kết nối được máy chủ');

export default api;
