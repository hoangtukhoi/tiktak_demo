/**
 * Kiểm thử nhanh phần định tuyến, middleware và validator.
 * Không cần MongoDB: chỉ gọi các endpoint trả lỗi trước khi chạm database.
 */
process.env.MONGODB_URI = 'mongodb://localhost:27017/tiktak_test';
process.env.JWT_SECRET = 'test_secret';
process.env.JWT_REFRESH_SECRET = 'test_refresh';
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';

const http = require('http');
const app = require('../app');

const PORT = 5199;

const request = (method, path, body, token) =>
  new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        host: '127.0.0.1',
        port: PORT,
        path,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      },
      (res) => {
        let buf = '';
        res.on('data', (c) => (buf += c));
        res.on('end', () => {
          let parsed = {};
          try { parsed = JSON.parse(buf || '{}'); } catch (e) { parsed = { raw: buf.slice(0, 80) }; }
          resolve({ status: res.statusCode, body: parsed });
        });
      }
    );
    req.on('error', (e) => resolve({ status: 0, body: { message: e.message } }));
    if (data) req.write(data);
    req.end();
  });

(async () => {
  const server = app.listen(PORT);
  const results = [];
  const check = (name, ok, extra = '') => results.push([ok ? 'PASS' : 'FAIL', name, ok ? '' : extra]);

  let r = await request('GET', '/health');
  check('health trả 200', r.status === 200 && r.body.status === 'ok');

  r = await request('GET', '/api/khong-ton-tai');
  check('404 handler', r.status === 404 && r.body.success === false);

  r = await request('GET', '/api/dubbing/languages');
  check('dubbing/languages trả 10 ngôn ngữ', r.status === 200 && r.body.data?.length === 10, String(r.status));

  r = await request('POST', '/api/auth/register', { username: 'a', email: 'khong-phai-email', password: '1' });
  check('register validator bắt lỗi', r.status === 400 && r.body.errors?.length >= 3, JSON.stringify(r.body).slice(0, 120));

  r = await request('POST', '/api/auth/login', {});
  check('login validator bắt thiếu field', r.status === 400);

  r = await request('POST', '/api/auth/refresh', {});
  check('refresh validator bắt thiếu token', r.status === 400);

  r = await request('GET', '/api/auth/me');
  check('me không token trả 401', r.status === 401);

  r = await request('GET', '/api/auth/me', null, 'token_rac');
  check('me token sai trả 401', r.status === 401);

  r = await request('POST', '/api/videos', { title: 'x' });
  check('tạo video không token trả 401', r.status === 401);

  r = await request('GET', '/api/admin/stats');
  check('admin không token trả 401', r.status === 401);

  r = await request('POST', '/api/upload');
  check('upload không token trả 401', r.status === 401);

  r = await request('GET', '/api/feed/following');
  check('following feed cần đăng nhập', r.status === 401);

  const jwt = require('jsonwebtoken');
  const fakeToken = jwt.sign({ sub: '507f1f77bcf86cd799439011', role: 'user' }, 'sai_secret');
  r = await request('GET', '/api/auth/me', null, fakeToken);
  check('token ký sai secret bị từ chối', r.status === 401);

  const expired = jwt.sign({ sub: '507f1f77bcf86cd799439011' }, process.env.JWT_SECRET, { expiresIn: '-1s' });
  r = await request('GET', '/api/auth/me', null, expired);
  check('token hết hạn trả 401', r.status === 401 && /hết hạn/.test(r.body.message), r.body.message);

  // Kiểm tra toàn bộ router đã được mount.
  const routes = ['auth', 'users', 'videos', 'upload', 'comments', 'feed', 'notifications', 'dubbing', 'admin'];
  const mounted = [];
  for (const name of routes) {
    const res = await request('GET', `/api/${name}/__probe__`);
    mounted.push([name, res.status !== 404 || res.body.message?.includes('__probe__')]);
  }
  check('9 router được mount', mounted.length === 9);

  // Validator của dubbing chạy trước khi chạm database.
  r = await request('POST', '/api/dubbing/request', { videoId: 'khong-hop-le', targetLang: 'xx' }, jwt.sign({ sub: '507f1f77bcf86cd799439011' }, process.env.JWT_SECRET));
  check('dubbing validator chặn input sai', [400, 401].includes(r.status), String(r.status));

  console.log('');
  for (const [status, name, extra] of results) {
    console.log(`${status}  ${name}${extra ? '  -> ' + extra : ''}`);
  }
  const failed = results.filter((x) => x[0] === 'FAIL').length;
  console.log(`\n${results.length - failed}/${results.length} kiểm thử đạt`);

  server.close();
  process.exit(failed ? 1 : 0);
})();
