/**
 * Backend giả chạy trong trình duyệt (chỉ dùng khi VITE_USE_MOCK=true).
 * Trả dữ liệu ĐÚNG format của backend: { success, message, data } và các model Mongoose.
 * Khi nối backend thật chỉ cần đặt VITE_USE_MOCK=false — file này không được import.
 */
import { AxiosError } from 'axios';

const G = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/';
const CLIPS = ['ForBiggerBlazes', 'ForBiggerEscapes', 'ForBiggerFun', 'ForBiggerJoyrides', 'ForBiggerMeltdowns', 'SubaruOutbackOnStreetAndDirt', 'WeAreGoingOnBullrun', 'VolkswagenGTIReview'];
const TITLES = [
  ['Lửa trại cuối tuần ở Mộc Châu 🔥', 'camping,mocchau,travel'],
  ['Trốn khỏi thành phố 1 ngày', 'escape,weekend,vlog'],
  ['Thử thách 15 giây vui nhất hôm nay', 'fun,challenge,trend'],
  ['Đi một vòng cho đã', 'roadtrip,chill,vietnam'],
  ['Khi deadline dí sát sau lưng', 'student,ptit,relatable'],
  ['Offroad qua đường đất đỏ', 'offroad,car,adventure'],
  ['Hành trình xuyên đêm', 'bullrun,night,cars'],
  ['Review nhanh trong 60 giây', 'review,tech,60s'],
];
const LINES = {
  vi: 'Xem hết video này đi, cái kết bất ngờ lắm đó',
  en: 'Watch this until the end, the ending is a real surprise',
  ja: '最後まで見てね、結末は本当に意外だよ',
  ko: '끝까지 봐 주세요, 결말이 정말 놀라워요',
  zh: '一定要看到最后，结局真的很意外',
  fr: "Regardez jusqu'au bout, la fin est une vraie surprise",
  de: 'Schau bis zum Ende, das Ende ist eine echte Überraschung',
  es: 'Míralo hasta el final, el final es una verdadera sorpresa',
  th: 'ดูให้จบนะ ตอนจบเซอร์ไพรส์มาก',
  id: 'Tonton sampai habis, endingnya benar-benar mengejutkan',
};
const LANGS = [
  ['vi', 'Tiếng Việt'], ['en', 'English'], ['zh', '中文'], ['ja', '日本語'], ['ko', '한국어'],
  ['fr', 'Français'], ['de', 'Deutsch'], ['es', 'Español'], ['th', 'ภาษาไทย'], ['id', 'Bahasa Indonesia'],
].map(([code, name]) => ({ code, name }));

const oid = () => (Date.now().toString(16) + Math.random().toString(16).slice(2, 12)).padEnd(24, '0').slice(0, 24);
const ago = (h) => new Date(Date.now() - h * 3600e3).toISOString();

const users = ['linh_dance', 'bepnhaminh', 'trekviet', 'guitarnam', 'skatehn', 'sciencelab', 'doggovn', 'lapbuilds']
  .map((username, i) => ({ _id: 'u' + i, username, email: `${username}@tiktak.vn`, avatarUrl: null, bio: ['Nhảy mỗi ngày', 'Nấu ăn kiểu nhà làm', 'Đi để kể', 'Guitar & chill', 'Skate Hà Nội', 'Khoa học vui', 'Boss nhà mình', 'Build game Roblox'][i], isVerified: i % 3 === 0, role: 'user', followerCount: (i + 2) * 13700, followingCount: 120 + i * 9, videoCount: 0, bannedAt: null, createdAt: ago(900) }));

const videos = CLIPS.map((c, i) => ({
  _id: 'v' + i, userId: users[i]._id, title: TITLES[i][0], description: '', hashtags: TITLES[i][1].split(','),
  originalUrl: G + c + '.mp4', hlsUrl: null, thumbnailUrl: G + 'images/' + c + '.jpg',
  durationMs: 15000, status: 'ready', moderationStatus: i === 5 ? 'flagged' : 'approved', flagReason: i === 5 ? 'Báo cáo spam' : null,
  viewCount: 40000 + ((i * 104729) % 900000), likeCount: 3200 + ((i * 7919) % 90000), commentCount: 3, shareCount: 40 + i * 31,
  isPrivate: false, allowComment: true, createdAt: ago(i * 7 + 2),
}));
users.forEach((u) => (u.videoCount = videos.filter((v) => v.userId === u._id).length));

const comments = videos.flatMap((v, i) => [
  ['trekviet', 'Cảnh đẹp quá trời, quay bằng máy gì vậy bạn?'], ['bepnhaminh', 'Làm tiếp phần 2 đi 🙏'], ['doggovn', 'Xem lại lần thứ ba rồi 😂'],
].map(([u, content], j) => ({ _id: `c${i}_${j}`, videoId: v._id, userId: users.find((x) => x.username === u)._id, parentId: null, content, likeCount: 30 - j * 9, replyCount: 0, createdAt: ago(j + 1) })));

const tracks = [];
const likes = new Set();
let notifications = [
  { _id: 'n1', type: 'new_like', payload: { actorUsername: 'linh_dance', videoId: 'v0' }, isRead: false, createdAt: ago(0.2) },
  { _id: 'n2', type: 'new_follower', payload: { actorUsername: 'trekviet' }, isRead: false, createdAt: ago(1.5) },
  { _id: 'n3', type: 'dubbing_done', payload: { videoId: 'v2', message: 'Bản lồng tiếng English cho “Thử thách 15 giây” đã xong' }, isRead: true, createdAt: ago(26) },
];

const read = (k, f) => { try { return JSON.parse(localStorage.getItem(k)) ?? f; } catch { return f; } };
let me = read('mock-me', null);
const setMe = (u) => { me = u; localStorage.setItem('mock-me', JSON.stringify(u)); };

const pop = (v) => ({ ...v, userId: users.find((u) => u._id === v.userId) || me || { _id: v.userId, username: 'user' }, isLiked: likes.has(v._id) });
const popC = (c) => ({ ...c, userId: users.find((u) => u._id === c.userId) || (me && me._id === c.userId ? me : { _id: c.userId, username: 'user' }) });
const visible = () => videos.filter((v) => v.status === 'ready' && v.moderationStatus !== 'removed');
const tokens = () => ({ accessToken: 'mock.' + oid(), refreshToken: 'mock-r.' + oid() });

function trackStatus(t) {
  const s = (Date.now() - t.t0) / 1000;
  const status = s < 1.5 ? 'pending' : s < 3.5 ? 'transcribing' : s < 5.5 ? 'translating' : s < 7.5 ? 'synthesizing' : 'done';
  return { ...t, status, transcript: s > 3.5 ? LINES.vi : null, translatedText: s > 5.5 ? LINES[t.targetLang] : null };
}

const ok = (data, status = 200, message = 'Success') => ({ status, data: { success: true, message, data } });
const fail = (message, status = 400) => ({ status, data: { success: false, message } });
const authed = (h) => (me ? h() : fail('Unauthorized', 401));

const routes = [
  ['post', /^\/auth\/login$/, (b) => {
    if (!b.email || !b.password) return fail('Validation error', 400);
    const username = b.email.split('@')[0].replace(/[^a-zA-Z0-9]/g, '') || 'user';
    setMe({ _id: 'me', username, email: b.email, avatarUrl: null, bio: '', role: /^admin/.test(b.email) ? 'admin' : 'user', isVerified: false, followerCount: 128, followingCount: 42, videoCount: 0 });
    return ok({ user: me, ...tokens() }, 200, 'Đăng nhập thành công');
  }],
  ['post', /^\/auth\/register$/, (b) => {
    if (users.some((u) => u.username === b.username)) return fail('Username đã tồn tại', 409);
    setMe({ _id: 'me', username: b.username, email: b.email, avatarUrl: null, bio: '', role: /^admin/.test(b.email) ? 'admin' : 'user', isVerified: false, followerCount: 0, followingCount: 0, videoCount: 0 });
    return ok({ user: me, ...tokens() }, 201, 'Đăng ký thành công');
  }],
  ['post', /^\/auth\/refresh$/, () => (me ? ok(tokens()) : fail('Invalid refresh token', 401))],
  ['post', /^\/auth\/logout$/, () => { setMe(null); return ok(null); }],
  ['get', /^\/auth\/me$/, () => authed(() => ok(me))],

  ['get', /^\/feed\/for-you$/, () => ok(visible().map(pop))],
  ['get', /^\/feed\/following$/, () => authed(() => ok(visible().filter((v) => ['u0', 'u2', 'u7'].includes(v.userId)).map(pop)))],

  ['get', /^\/videos\/search$/, (_, p) => { const q = (p.q || '').toLowerCase().replace('#', ''); return ok(visible().filter((v) => (v.title + ' ' + v.hashtags.join(' ')).toLowerCase().includes(q)).map(pop)); }],
  ['post', /^\/videos$/, (b) => authed(() => {
    const v = { _id: oid(), userId: me._id, title: b.title, description: b.description || '', hashtags: b.hashtags || [], originalUrl: null, hlsUrl: null, thumbnailUrl: null, status: 'uploading', moderationStatus: 'approved', viewCount: 0, likeCount: 0, commentCount: 0, shareCount: 0, isPrivate: !!b.isPrivate, allowComment: b.allowComment !== false, createdAt: new Date().toISOString(), _t0: Date.now() };
    videos.unshift(v);
    return ok(v, 201);
  })],
  ['post', /^\/upload$/, (b, p, cfg) => authed(() => {
    const f = cfg.data;
    const v = { _id: oid(), userId: me._id, title: f.get('title'), description: f.get('description') || '', hashtags: JSON.parse(f.get('hashtags') || '[]'), originalUrl: URL.createObjectURL(f.get('video')), hlsUrl: null, thumbnailUrl: null, status: 'processing', moderationStatus: 'approved', viewCount: 0, likeCount: 0, commentCount: 0, shareCount: 0, isPrivate: false, allowComment: true, createdAt: new Date().toISOString(), _t0: Date.now() };
    videos.unshift(v);
    return ok({ videoId: v._id, jobId: v._id }, 202);
  })],
  ['get', /^\/videos\/([^/]+)$/, (_, p, c, [id]) => {
    const v = videos.find((x) => x._id === id);
    if (!v) return fail('Not found', 404);
    if (v._t0 && v.status !== 'ready' && Date.now() - v._t0 > 6000) v.status = 'ready';
    return ok(pop(v));
  }],
  ['post', /^\/videos\/([^/]+)\/like$/, (_, p, c, [id]) => authed(() => {
    const v = videos.find((x) => x._id === id);
    likes.has(id) ? (likes.delete(id), v.likeCount--) : (likes.add(id), v.likeCount++);
    return ok({ isLiked: likes.has(id), likeCount: v.likeCount });
  })],
  ['post', /^\/videos\/([^/]+)\/view$/, (_, p, c, [id]) => { const v = videos.find((x) => x._id === id); if (v) v.viewCount++; return ok(null); }],
  ['delete', /^\/videos\/([^/]+)$/, (_, p, c, [id]) => authed(() => { const v = videos.find((x) => x._id === id); if (v) v.status = 'failed'; return ok(null, 200, 'Deleted'); })],

  ['get', /^\/comments\/video\/([^/]+)$/, (_, p, c, [id]) => ok(comments.filter((x) => x.videoId === id && !x.parentId).map(popC))],
  ['get', /^\/comments\/([^/]+)\/replies$/, () => ok([])],
  ['post', /^\/comments$/, (b) => authed(() => {
    const cm = { _id: oid(), videoId: b.videoId, userId: me._id, parentId: b.parentId || null, content: b.content || b.text, likeCount: 0, replyCount: 0, createdAt: new Date().toISOString() };
    comments.unshift(cm);
    const v = videos.find((x) => x._id === b.videoId); if (v) v.commentCount++;
    return ok(popC(cm), 201);
  })],
  ['post', /^\/comments\/([^/]+)\/like$/, () => authed(() => ok(null))],
  ['delete', /^\/comments\/([^/]+)$/, (_, p, c, [id]) => authed(() => { const i = comments.findIndex((x) => x._id === id); if (i > -1) comments.splice(i, 1); return ok(null); })],

  ['get', /^\/users\/search$/, (_, p) => ok(users.filter((u) => u.username.includes((p.q || '').toLowerCase())))],
  ['patch', /^\/users\/me$/, (b) => authed(() => { setMe({ ...me, ...b }); return ok(me); })],
  ['get', /^\/users\/([^/]+)\/videos$/, (_, p, c, [id]) => ok(videos.filter((v) => v.userId === id && v.status !== 'failed').map(pop))],
  ['get', /^\/users\/([^/]+)$/, (_, p, c, [name]) => { const u = users.find((x) => x.username === name) || (me?.username === name ? me : null); return u ? ok(u) : fail('User not found', 404); }],

  ['get', /^\/dubbing\/languages$/, () => ok(LANGS)],
  ['post', /^\/dubbing\/request$/, (b) => authed(() => {
    let t = tracks.find((x) => x.videoId === b.videoId && x.targetLang === b.targetLang);
    if (t && trackStatus(t).status === 'done') return ok(trackStatus(t), 200, 'Đã có bản dịch');
    if (!t) tracks.push((t = { _id: oid(), videoId: b.videoId, sourceLang: b.sourceLang || 'vi', targetLang: b.targetLang, audioUrl: null, subtitleUrl: null, t0: Date.now() }));
    return ok({ trackId: t._id, jobId: t._id, status: 'pending' }, 202, 'Đang xử lý lồng tiếng');
  })],
  ['get', /^\/dubbing\/([^/]+)\/status$/, (_, p, c, [id]) => { const t = tracks.find((x) => x._id === id); return t ? ok(trackStatus(t)) : fail('Track not found', 404); }],
  ['get', /^\/dubbing\/video\/([^/]+)$/, (_, p, c, [id]) => ok(tracks.filter((t) => t.videoId === id).map(trackStatus))],

  ['get', /^\/notifications$/, () => authed(() => ok(notifications))],
  ['get', /^\/notifications\/unread-count$/, () => authed(() => ok({ count: notifications.filter((n) => !n.isRead).length }))],
  ['post', /^\/notifications\/read-all$/, () => authed(() => { notifications = notifications.map((n) => ({ ...n, isRead: true })); return ok(null); })],
  ['patch', /^\/notifications\/([^/]+)\/read$/, (_, p, c, [id]) => authed(() => { notifications = notifications.map((n) => (n._id === id ? { ...n, isRead: true } : n)); return ok(null); })],

  ['get', /^\/admin\/stats$/, () => ok({ users: users.length, videos: videos.length })],
  ['get', /^\/admin\/users$/, () => ok(users)],
  ['post', /^\/admin\/users\/([^/]+)\/(ban|unban|verify)$/, (_, p, c, [id, act]) => {
    const u = users.find((x) => x._id === id);
    if (act === 'ban') u.bannedAt = new Date().toISOString(); else if (act === 'unban') u.bannedAt = null; else u.isVerified = true;
    return ok(u);
  }],
  ['get', /^\/admin\/videos\/flagged$/, () => ok(videos.filter((v) => v.moderationStatus === 'flagged').map(pop))],
  ['get', /^\/admin\/videos$/, () => ok(videos.filter((v) => v.moderationStatus !== 'removed').map(pop))],
  ['delete', /^\/admin\/videos\/([^/]+)$/, (_, p, c, [id]) => { const v = videos.find((x) => x._id === id); if (v) v.moderationStatus = 'removed'; return ok(null); }],
  ['post', /^\/admin\/videos\/([^/]+)\/approve$/, (_, p, c, [id]) => { const v = videos.find((x) => x._id === id); if (v) v.moderationStatus = 'approved'; return ok(null); }],
  ['get', /^\/admin\/audit-logs$/, () => ok([])],
];

export default async function mockAdapter(config) {
  // Mô phỏng tiến trình upload cho multipart
  if (config.data instanceof FormData && config.onUploadProgress) {
    for (let i = 1; i <= 20; i++) { await new Promise((r) => setTimeout(r, 70)); config.onUploadProgress({ loaded: i, total: 20 }); }
  } else {
    await new Promise((r) => setTimeout(r, 120 + Math.random() * 180));
  }
  const method = config.method.toLowerCase();
  const url = config.url.replace(/\?.*$/, '');
  const body = typeof config.data === 'string' ? JSON.parse(config.data || '{}') : config.data || {};
  let res = fail('Not found', 404);
  for (const [m, re, h] of routes) {
    const match = m === method && url.match(re);
    if (match) { res = h(body, config.params || {}, config, match.slice(1)); break; }
  }
  const response = { ...res, statusText: String(res.status), headers: {}, config, request: {} };
  if (res.status >= 400) throw new AxiosError(res.data.message, String(res.status), config, {}, response);
  return response;
}
