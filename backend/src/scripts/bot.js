#!/usr/bin/env node
/**
 * Bot giả lập người dùng cho TikTak — tạo dữ liệu thật để test / demo
 * (lượt xem, thích, bình luận, tag tên, lưu, chia sẻ, đăng lại, theo dõi, đăng video, báo cáo).
 *
 * Bot gọi API thật của backend như một người dùng bình thường, nên mọi thứ chạy đúng luồng:
 * thông báo realtime, trang phân tích, kiểm duyệt bình luận, giới hạn tốc độ...
 *
 * Cách chạy (backend phải đang chạy, mặc định http://localhost:5000):
 *   npm run bot                                   # 8 bot, chạy 10 phút
 *   npm run bot -- --bots 15 --minutes 30
 *   npm run bot -- --target ten_cua_ban           # dồn tương tác vào video của 1 tài khoản (xem thông báo trượt)
 *   npm run bot -- --upload-dir D:/clips          # cho bot đăng video lấy từ thư mục này
 *   npm run bot -- --generate-videos 3            # tự tạo 3 video mẫu bằng ffmpeg rồi cho bot đăng
 *   npm run bot -- --toxic 0.1                    # 10% bình luận có từ tục → thử kiểm duyệt
 *   npm run bot -- --help
 *
 * Tài khoản bot được lưu ở backend/.bot-accounts.json để lần sau dùng lại.
 * Chỉ chạy với backend trên máy (localhost) trừ khi thêm --allow-remote.
 */
require('dotenv').config();
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');

// ─── Tham số dòng lệnh ──────────────────────────────────────────────────────
const DEFAULTS = {
  api: `http://localhost:${process.env.PORT || 5000}/api`,
  bots: 8,
  minutes: 10,
  speed: 1, // số hành động / giây (cộng tất cả bot)
  target: '',
  'upload-dir': '',
  'generate-videos': 0,
  'max-uploads': 5,
  toxic: 0.05,
  report: 0.003,
  'allow-remote': false,
  quiet: false,
  help: false,
};

function parseArgs(argv) {
  const out = { ...DEFAULTS };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const [k, inline] = a.slice(2).split('=');
    if (!(k in DEFAULTS)) {
      console.error(`Không hiểu tham số --${k} (xem --help)`);
      process.exit(1);
    }
    if (typeof DEFAULTS[k] === 'boolean') out[k] = inline === undefined ? true : inline !== 'false';
    else {
      const v = inline ?? argv[++i];
      out[k] = typeof DEFAULTS[k] === 'number' ? Number(v) : v;
      if (typeof DEFAULTS[k] === 'number' && !Number.isFinite(out[k])) {
        console.error(`--${k} phải là số`);
        process.exit(1);
      }
    }
  }
  return out;
}

const opt = parseArgs(process.argv.slice(2));
if (opt.help) {
  console.log(`
Bot giả lập người dùng TikTak

  --bots N              số tài khoản bot (mặc định ${DEFAULTS.bots})
  --minutes N           chạy trong N phút, 0 = chạy tới khi bấm Ctrl+C (mặc định ${DEFAULTS.minutes})
  --speed N             tổng số hành động mỗi giây (mặc định ${DEFAULTS.speed}, tối đa 4)
  --target USERNAME     ưu tiên xem/thích/bình luận video của tài khoản này (70%)
  --upload-dir DIR      thư mục chứa video (.mp4/.mov/.webm) để bot đăng
  --generate-videos N   tự tạo N video mẫu 6 giây bằng ffmpeg (cần ffmpeg / FFMPEG_PATH)
  --max-uploads N       số video tối đa bot đăng trong 1 lần chạy (mặc định ${DEFAULTS['max-uploads']})
  --toxic 0..1          tỉ lệ bình luận có từ tục để thử kiểm duyệt (mặc định ${DEFAULTS.toxic})
  --report 0..1         tỉ lệ một lượt xem kết thúc bằng báo cáo video (mặc định ${DEFAULTS.report})
  --api URL             địa chỉ API (mặc định ${DEFAULTS.api})
  --allow-remote        cho phép chạy với server không phải localhost
  --quiet               không in từng hành động
`);
  process.exit(0);
}

const API = opt.api.replace(/\/$/, '');
const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//.test(`${API}/`);
if (!isLocal && !opt['allow-remote']) {
  console.error(`✖ ${API} không phải localhost. Bot tạo tương tác giả nên chỉ dùng cho môi trường test; thêm --allow-remote nếu chắc chắn.`);
  process.exit(1);
}
opt.speed = Math.min(Math.max(opt.speed, 0.1), 4); // giới hạn chung của API: ~5 request/giây/IP khi dev

// ─── Dữ liệu mẫu ───────────────────────────────────────────────────────────
const NAMES = ['linh', 'minh', 'trang', 'huy', 'ngoc', 'khanh', 'tuan', 'mai', 'duc', 'thao', 'nam', 'vy', 'quan', 'an', 'phuong', 'long', 'ha', 'bao', 'my', 'son'];
const PERSONAS = [
  { tags: ['travel', 'vlog', 'dalat', 'hanoi'], bio: 'Đi để kể ✈️' },
  { tags: ['food', 'nauan', 'review', 'streetfood'], bio: 'Ăn là chính 🍜' },
  { tags: ['dance', 'trend', 'challenge'], bio: 'Nhảy mỗi ngày 💃' },
  { tags: ['tech', 'code', 'ptit', 'student'], bio: 'Code dạo 💻' },
  { tags: ['pet', 'cat', 'dog', 'cute'], bio: 'Sen của 2 boss 🐱' },
  { tags: ['music', 'guitar', 'cover'], bio: 'Hát cho vui 🎸' },
  { tags: ['funny', 'meme', 'relatable'], bio: 'Hài là chính 😂' },
];
const COMMENTS = [
  'Hay quá trời luôn', 'Xem đi xem lại mấy lần rồi 😂', 'Đỉnh thật sự 🔥', 'Cho xin tên bài nhạc với ạ',
  'Ra phần 2 đi bạn ơi 🙏', 'Quay bằng máy gì vậy ạ?', 'Cười xỉu 🤣', 'Đẹp quá, muốn đi ghê',
  'Ủa sao giống mình vậy 😆', 'Đúng là chân ái', 'Video chất lượng ghê', 'Lưu lại xem sau',
  'Ai xem tới đây rồi điểm danh 🙋', 'Cái kết bất ngờ thật', 'Thả tim cho bạn nè ❤️', 'Hướng dẫn chi tiết hơn được không ạ',
  'Mê cái góc quay này', 'Âm thanh nghe đã tai thật', 'Chuẩn không cần chỉnh 👌', 'Hôm nay lướt trúng video này vui ghê',
];
const MENTION_COMMENTS = ['@{u} vào xem cái này nè', '@{u} giống bà quá 🤣', 'Tag @{u} vào đây', '@{u} hôm nào đi thử đi', '@{u} ơi xem đi'];
const REPLIES = ['Đồng ý luôn 👍', 'Chuẩn', 'Haha thật', 'Mình cũng nghĩ vậy', 'Quá đúng 😂', '+1'];
// Chỉ để thử bộ kiểm duyệt bình luận (bộ lọc từ khoá / model)
const TOXIC = ['vcl đỉnh thật', 'đm hay vãi', 'video như cc', 'đồ ngu, xem phí thời gian', 'vl thật sự'];
const TITLES = ['Một ngày của mình', 'Thử thách 15 giây', 'Góc nhỏ chill cuối tuần', 'Review nhanh', 'Đi đâu đó cho vui', 'Khoảnh khắc hôm nay', 'Học cái mới mỗi ngày'];
const REPORT_REASONS = ['spam', 'misinformation', 'harassment', 'other'];
const SHARE_METHODS = ['copy_link', 'messenger', 'facebook', 'zalo'];

// ─── Tiện ích ──────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const chance = (p) => Math.random() < p;
const rand = (min, max) => min + Math.random() * (max - min);
const time = () => new Date().toLocaleTimeString('vi-VN', { hour12: false });
const stats = {};
const count = (k) => { stats[k] = (stats[k] || 0) + 1; };
const log = (bot, msg) => !opt.quiet && console.log(`${time()}  @${bot.username.padEnd(14)} ${msg}`);

class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

async function call(method, url, { token, body, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';
  let res;
  try {
    res = await fetch(`${API}${url}`, { method, headers, body: form || (body && JSON.stringify(body)) });
  } catch (err) {
    throw new ApiError(0, `không kết nối được ${API} (${err.cause?.code || err.message}) — backend đã chạy chưa?`);
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, [json.message || res.statusText, ...(json.errors || [])].join(' — '));
  return json;
}

// ─── Tài khoản bot ─────────────────────────────────────────────────────────
const ACCOUNTS_FILE = path.join(__dirname, '../../.bot-accounts.json');
const loadAccounts = () => { try { return JSON.parse(fs.readFileSync(ACCOUNTS_FILE, 'utf8')); } catch { return []; } };
const saveAccounts = (list) => fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(list, null, 2));

async function ensureBots(n) {
  const saved = loadAccounts();
  const bots = [];
  for (let i = 0; i < n; i += 1) {
    let acc = saved[i];
    if (!acc) {
      const username = `bot${NAMES[i % NAMES.length]}${String(i + 1).padStart(2, '0')}`;
      acc = { username, email: `${username}@bot.example.com`, password: crypto.randomBytes(9).toString('base64url'), persona: i % PERSONAS.length };
      saved[i] = acc;
    }
    const bot = { ...acc, token: null, userId: null, uploads: 0 };
    await signIn(bot, true);
    bots.push(bot);
  }
  saveAccounts(saved);
  return bots;
}

async function signIn(bot, allowRegister = false) {
  try {
    const r = await call('POST', '/auth/login', { body: { email: bot.email, password: bot.password } });
    bot.token = r.data.accessToken;
    bot.userId = r.data.user._id;
  } catch (err) {
    if (!allowRegister || err.status !== 401) throw err;
    const r = await call('POST', '/auth/register', { body: { username: bot.username, email: bot.email, password: bot.password } });
    bot.token = r.data.accessToken;
    bot.userId = r.data.user._id;
    const p = PERSONAS[bot.persona];
    await call('PATCH', '/users/me', { token: bot.token, body: { bio: `${p.bio} · tài khoản bot test` } }).catch(() => {});
    console.log(`  + tạo bot @${bot.username}`);
  }
}

/** Gọi API bằng tài khoản bot, token hết hạn thì đăng nhập lại 1 lần */
async function as(bot, method, url, extra = {}) {
  try {
    return await call(method, url, { ...extra, token: bot.token });
  } catch (err) {
    if (err.status !== 401) throw err;
    await signIn(bot);
    return call(method, url, { ...extra, token: bot.token });
  }
}

// ─── Chọn video để xem ─────────────────────────────────────────────────────
let targetVideos = [];
async function refreshTarget(bot) {
  if (!opt.target) return;
  const r = await as(bot, 'GET', `/users/${encodeURIComponent(opt.target)}/videos?limit=30`).catch(() => null);
  targetVideos = r?.data || [];
}

async function pickVideo(bot) {
  if (opt.target && targetVideos.length && chance(0.7)) return pick(targetVideos);
  const page = chance(0.7) ? 0 : Math.floor(rand(1, 4));
  const feed = await as(bot, 'GET', `/feed/${chance(0.2) ? 'following' : 'for-you'}?cursor=${page}&limit=20`).catch(() => null);
  let list = feed?.data || [];
  if (!list.length) list = (await as(bot, 'GET', '/feed/for-you?limit=20').catch(() => null))?.data || [];
  // Bot không tương tác với video của chính mình
  list = list.filter((v) => String(v.userId?._id || v.userId) !== String(bot.userId));
  if (!list.length) return null;
  // Ưu tiên video có hashtag hợp sở thích
  const tags = PERSONAS[bot.persona].tags;
  const liked = list.filter((v) => (v.hashtags || []).some((t) => tags.includes(t)));
  return pick(liked.length && chance(0.6) ? liked : list);
}

const authorOf = (v) => v.userId?.username || null;

// ─── Hành động ─────────────────────────────────────────────────────────────
// Giới hạn lượt xem toàn cục: backend chặn 120 lượt/phút/IP
const viewTimes = [];
async function viewSlot() {
  for (;;) {
    const now = Date.now();
    while (viewTimes.length && now - viewTimes[0] > 60_000) viewTimes.shift();
    if (viewTimes.length < 90) { viewTimes.push(now); return; }
    await sleep(1000);
  }
}

async function watch(bot, bots) {
  const v = await pickVideo(bot);
  if (!v) { log(bot, 'không có video nào để xem'); return; }
  const durationMs = v.durationMs || 15000;
  // Đa số xem một đoạn, khoảng 35% xem hết (có khi xem lại)
  const completed = chance(0.35);
  const watchTimeMs = Math.round(completed ? durationMs * rand(1, 1.8) : durationMs * rand(0.08, 0.85));
  await viewSlot();
  await as(bot, 'POST', `/videos/${v._id}/view`, { body: { watchTimeMs, durationMs, completed, source: opt.target && authorOf(v) === opt.target ? 'profile' : 'for_you' } });
  count('xem');
  log(bot, `xem "${v.title}" ${Math.round(watchTimeMs / 1000)}s${completed ? ' (hết)' : ''}`);

  // Càng xem lâu càng dễ tương tác
  const engaged = completed ? 1 : watchTimeMs / durationMs;
  if (!v.isLiked && chance(0.15 + 0.35 * engaged)) {
    const r = await as(bot, 'POST', `/videos/${v._id}/like`);
    if (r.data?.liked !== false) { count('thích'); log(bot, '  ♥ thích'); }
  }
  if (v.allowComment !== false && chance(0.04 + 0.12 * engaged)) await comment(bot, v, bots);
  if (!v.isSaved && chance(0.03 + 0.07 * engaged)) {
    await as(bot, 'POST', `/videos/${v._id}/save`);
    count('lưu'); log(bot, '  🔖 lưu video');
  }
  if (chance(0.02 + 0.05 * engaged)) {
    await as(bot, 'POST', `/videos/${v._id}/share`, { body: { method: pick(SHARE_METHODS) } });
    count('chia sẻ'); log(bot, '  ↗ chia sẻ');
  }
  if (!v.isReposted && chance(0.01 + 0.04 * engaged)) {
    const r = await as(bot, 'POST', `/videos/${v._id}/repost`).catch(() => null);
    if (r?.data?.reposted) { count('đăng lại'); log(bot, '  🔁 đăng lại'); }
  }
  const author = authorOf(v);
  if (author && chance(0.04 * engaged + 0.01)) {
    const r = await as(bot, 'POST', `/users/${encodeURIComponent(author)}/follow`).catch(() => null);
    if (r?.data?.following !== false) { count('theo dõi'); log(bot, `  + theo dõi @${author}`); }
  }
  if (opt.report > 0 && chance(opt.report)) {
    const r = await as(bot, 'POST', `/videos/${v._id}/report`, { body: { reason: pick(REPORT_REASONS), note: 'Báo cáo thử từ bot test' } }).catch((e) => e);
    if (!(r instanceof Error)) { count('báo cáo'); log(bot, '  ⚑ báo cáo video'); }
  }
}

async function comment(bot, v, bots) {
  // 30%: trả lời 1 bình luận có sẵn
  if (chance(0.3)) {
    const list = (await as(bot, 'GET', `/comments/video/${v._id}?limit=10`).catch(() => null))?.data || [];
    const others = list.filter((c) => String(c.userId?._id) !== String(bot.userId));
    if (others.length) {
      const parent = pick(others);
      const r = await as(bot, 'POST', '/comments', { body: { videoId: v._id, parentId: parent._id, content: `@${parent.userId.username} ${pick(REPLIES)}` } });
      count('trả lời');
      log(bot, `  ↳ trả lời @${parent.userId.username}${r.data.moderationStatus !== 'approved' ? ` [${r.data.moderationStatus}]` : ''}`);
      if (chance(0.3)) await as(bot, 'POST', `/comments/${parent._id}/like`).catch(() => {});
      return;
    }
  }
  let content;
  if (opt.toxic > 0 && chance(opt.toxic)) content = pick(TOXIC);
  else if (chance(0.2)) {
    // Tag 1 bot khác hoặc tài khoản target
    const friend = opt.target && chance(0.5) ? opt.target : pick(bots.filter((b) => b !== bot)).username;
    content = pick(MENTION_COMMENTS).replace('{u}', friend);
  } else content = pick(COMMENTS);
  const r = await as(bot, 'POST', '/comments', { body: { videoId: v._id, content } });
  const status = r.data.moderationStatus;
  count({ approved: 'bình luận', pending: 'bình luận chờ duyệt', rejected: 'bình luận bị ẩn' }[status] || 'bình luận');
  log(bot, `  💬 "${content}"${status !== 'approved' ? `  [${status === 'pending' ? 'chờ duyệt' : 'bị ẩn'}]` : ''}`);
}

// ─── Đăng video ────────────────────────────────────────────────────────────
const VIDEO_EXT = /\.(mp4|mov|webm|mkv|m4v)$/i;
let videoFiles = [];
let uploadsDone = 0;

function ffmpegBin() { return process.env.FFMPEG_PATH || 'ffmpeg'; }

function generateVideo(file, i) {
  const hue = (i * 67) % 360;
  return new Promise((resolve, reject) => {
    execFile(ffmpegBin(), [
      '-y', '-f', 'lavfi', '-i', `testsrc2=size=540x960:rate=30:duration=6,hue=h=${hue}`,
      '-f', 'lavfi', '-i', `sine=frequency=${300 + i * 60}:duration=6`,
      '-shortest', '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart', file,
    ], (err) => (err ? reject(err) : resolve(file)));
  });
}

async function prepareVideos() {
  if (opt['upload-dir']) {
    const dir = path.resolve(opt['upload-dir']);
    if (!fs.existsSync(dir)) { console.error(`✖ Không có thư mục ${dir}`); process.exit(1); }
    videoFiles = fs.readdirSync(dir).filter((f) => VIDEO_EXT.test(f)).map((f) => path.join(dir, f));
    console.log(`  ${videoFiles.length} video trong ${dir}`);
  }
  if (opt['generate-videos'] > 0) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tiktak-bot-'));
    console.log(`  Đang tạo ${opt['generate-videos']} video mẫu bằng ffmpeg...`);
    for (let i = 0; i < opt['generate-videos']; i += 1) {
      try {
        videoFiles.push(await generateVideo(path.join(dir, `bot-sample-${i + 1}.mp4`), i));
      } catch (err) {
        console.warn(`  ! Không tạo được video bằng ffmpeg (${err.code || err.message}). Cài ffmpeg hoặc đặt FFMPEG_PATH trong .env.`);
        break;
      }
    }
  }
}

async function upload(bot, bots) {
  const file = videoFiles.shift();
  if (!file) return false;
  const p = PERSONAS[bot.persona];
  const tags = [...new Set([pick(p.tags), pick(p.tags), 'tiktakbot'])];
  const title = `${pick(TITLES)} ${pick(['✨', '🔥', '😆', '🎬', ''])}`.trim();
  const friend = pick(bots.filter((b) => b !== bot));
  const description = chance(0.4) ? `Quay cùng @${friend.username} nè` : '';
  const form = new FormData();
  const type = file.endsWith('.webm') ? 'video/webm' : file.endsWith('.mov') ? 'video/quicktime' : 'video/mp4';
  form.append('video', new Blob([fs.readFileSync(file)], { type }), path.basename(file));
  form.append('title', title);
  form.append('description', description);
  form.append('hashtags', JSON.stringify(tags));
  const r = await as(bot, 'POST', '/upload', { form });
  bot.uploads += 1;
  uploadsDone += 1;
  count('đăng video');
  log(bot, `⬆ đăng video "${title}" (${path.basename(file)}) → ${r.data.videoId}`);
  return true;
}

// ─── Vòng lặp chính ────────────────────────────────────────────────────────
async function step(bot, bots) {
  const canUpload = videoFiles.length && uploadsDone < opt['max-uploads'];
  if (canUpload && chance(0.04)) {
    if (await upload(bot, bots)) return;
  }
  await watch(bot, bots);
}

function printSummary(started) {
  const mins = ((Date.now() - started) / 60000).toFixed(1);
  console.log(`\n── Tổng kết sau ${mins} phút ──`);
  const rows = Object.entries(stats).sort((a, b) => b[1] - a[1]);
  if (!rows.length) console.log('  (chưa làm được gì)');
  for (const [k, n] of rows) console.log(`  ${k.padEnd(22)} ${n}`);
}

async function main() {
  console.log(`TikTak bot → ${API}`);
  await call('GET', '/feed/for-you?limit=1').catch((err) => {
    console.error(`✖ ${err.message}`);
    process.exit(1);
  });

  console.log(`Chuẩn bị ${opt.bots} tài khoản bot...`);
  const bots = await ensureBots(Math.max(1, Math.min(opt.bots, 50)));
  await prepareVideos();
  if (opt.target) {
    await refreshTarget(bots[0]);
    console.log(`  Ưu tiên video của @${opt.target}: ${targetVideos.length} video`);
  }

  const started = Date.now();
  const endAt = opt.minutes > 0 ? started + opt.minutes * 60_000 : Infinity;
  let stopping = false;
  process.on('SIGINT', () => {
    if (stopping) process.exit(0);
    stopping = true;
    console.log('\nĐang dừng (bấm Ctrl+C lần nữa để thoát ngay)...');
  });

  console.log(`Bắt đầu: ${bots.length} bot, ~${opt.speed} hành động/giây${opt.minutes > 0 ? `, trong ${opt.minutes} phút` : ', tới khi bấm Ctrl+C'}\n`);
  let lastTargetRefresh = Date.now();
  let errorsInRow = 0;
  while (!stopping && Date.now() < endAt) {
    const bot = pick(bots);
    try {
      await step(bot, bots);
      errorsInRow = 0;
    } catch (err) {
      count('lỗi');
      errorsInRow += 1;
      log(bot, `✖ ${err.status || ''} ${err.message}`);
      if (err.status === 0 || errorsInRow >= 20) { console.error('Dừng vì lỗi liên tục.'); break; }
      if (err.status === 429) { console.log('  … bị giới hạn tốc độ, nghỉ 30 giây'); await sleep(30_000); }
    }
    if (opt.target && Date.now() - lastTargetRefresh > 60_000) {
      lastTargetRefresh = Date.now();
      await refreshTarget(bot);
    }
    // Khoảng nghỉ ngẫu nhiên quanh 1/speed giây cho giống người thật
    await sleep(rand(0.4, 1.6) * (1000 / opt.speed));
  }
  printSummary(started);
}

main().catch((err) => {
  console.error('✖', err.message);
  process.exit(1);
});
