/**
 * Backend giả chạy trong trình duyệt (chỉ dùng khi VITE_USE_MOCK=true).
 * Trả dữ liệu ĐÚNG format của backend: { success, message, data } và các model Mongoose.
 * Các route mới (follow, save, report, avatar...) mô tả hợp đồng mà backend cần làm — xem frontend/README.md.
 */
import { AxiosError } from 'axios';

const G = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/';
const CLIPS = ['ForBiggerBlazes', 'ForBiggerEscapes', 'ForBiggerFun', 'ForBiggerJoyrides', 'ForBiggerMeltdowns', 'SubaruOutbackOnStreetAndDirt', 'WeAreGoingOnBullrun', 'VolkswagenGTIReview'];
const TITLES = [
  ['Lửa trại cuối tuần ở Mộc Châu', 'camping,mocchau,travel'],
  ['Trốn khỏi thành phố một ngày', 'escape,weekend,vlog'],
  ['Thử thách 15 giây hôm nay', 'fun,challenge,trend'],
  ['Đi một vòng cho đã', 'roadtrip,chill,vietnam'],
  ['Khi deadline dí sát sau lưng', 'student,ptit,relatable'],
  ['Offroad qua đường đất đỏ', 'offroad,car,adventure'],
  ['Hành trình xuyên đêm', 'bullrun,night,cars'],
  ['Review nhanh trong 60 giây', 'review,tech,60s'],
];
const LINES = {
  vi: 'Xem hết video này đi, cái kết bất ngờ lắm đó', en: 'Watch this until the end, the ending is a real surprise',
  ja: '最後まで見てね、結末は本当に意外だよ', ko: '끝까지 봐 주세요, 결말이 정말 놀라워요', zh: '一定要看到最后，结局真的很意外',
  fr: "Regardez jusqu'au bout, la fin est une vraie surprise", de: 'Schau bis zum Ende, das Ende ist eine echte Überraschung',
  es: 'Míralo hasta el final, el final es una verdadera sorpresa', th: 'ดูให้จบนะ ตอนจบเซอร์ไพรส์มาก', id: 'Tonton sampai habis, endingnya benar-benar mengejutkan',
};
const LANGS = [['vi', 'Tiếng Việt'], ['en', 'English'], ['zh', '中文'], ['ja', '日本語'], ['ko', '한국어'], ['fr', 'Français'], ['de', 'Deutsch'], ['es', 'Español'], ['th', 'ภาษาไทย'], ['id', 'Bahasa Indonesia']].map(([code, name]) => ({ code, name }));

const oid = () => (Date.now().toString(16) + Math.random().toString(16).slice(2, 12)).padEnd(24, '0').slice(0, 24);
const ago = (h) => new Date(Date.now() - h * 3600e3).toISOString();
const read = (k, f) => { try { return JSON.parse(localStorage.getItem(k)) ?? f; } catch { return f; } };

const users = ['linh_dance', 'bepnhaminh', 'trekviet', 'guitarnam', 'skatehn', 'sciencelab', 'doggovn', 'lapbuilds']
  .map((username, i) => ({ _id: 'u' + i, username, email: `${username}@tiktak.vn`, avatarUrl: null, bio: ['Nhảy mỗi ngày', 'Nấu ăn kiểu nhà làm', 'Đi để kể', 'Guitar & chill', 'Skate Hà Nội', 'Khoa học vui', 'Boss nhà mình', 'Build game Roblox'][i], isVerified: i % 3 === 0, role: 'user', followerCount: (i + 2) * 13700, followingCount: 120 + i * 9, videoCount: 0, bannedAt: null, createdAt: ago(900) }));

const videos = CLIPS.map((c, i) => ({
  _id: 'v' + i, userId: users[i]._id, title: TITLES[i][0], description: i % 2 ? 'Quay bằng điện thoại, không chỉnh màu.' : '', hashtags: TITLES[i][1].split(','),
  originalUrl: G + c + '.mp4', hlsUrl: null, thumbnailUrl: G + 'images/' + c + '.jpg',
  durationMs: 15000, status: 'ready', moderationStatus: i === 5 ? 'flagged' : 'approved', flagReason: i === 5 ? 'Báo cáo spam' : null,
  viewCount: 40000 + ((i * 104729) % 900000), likeCount: 3200 + ((i * 7919) % 90000), commentCount: 3, shareCount: 40 + i * 31, saveCount: 120 + i * 17,
  visibility: 'public', isPrivate: false, allowComment: true, allowDuet: true, isDraft: false, createdAt: ago(i * 7 + 2),
}));
users.forEach((u) => (u.videoCount = videos.filter((v) => v.userId === u._id).length));

const comments = videos.flatMap((v, i) => [
  ['trekviet', 'Cảnh đẹp quá, quay bằng máy gì vậy bạn?'], ['bepnhaminh', 'Làm tiếp phần 2 đi'], ['doggovn', 'Xem lại lần thứ ba rồi'],
].map(([u, content], j) => ({ _id: `c${i}_${j}`, videoId: v._id, userId: users.find((x) => x.username === u)._id, parentId: null, content, likeCount: 30 - j * 9, replyCount: 0, createdAt: ago(j + 1) })));

const tracks = [];
const likes = new Set(read('mock-likes', []));
const saves = new Set(read('mock-saves', []));
const follows = new Set(read('mock-follows', ['u0', 'u2', 'u7']));   // userId mà "tôi" đang theo dõi
const commentLikes = new Set();
const reports = [];
const shared = new Set();   // mỗi tài khoản chỉ tính 1 lượt chia sẻ / video
const reposts = new Set(read('mock-reposts', []));
const blockedNames = new Set();
let privacy = { followersVisibility: 'everyone', followingVisibility: 'everyone', likedVisibility: 'only_me', repostsVisibility: 'everyone', commentPermission: 'everyone', mentionPermission: 'everyone', allowRepost: true, discoverable: true };
const persist = () => {
  localStorage.setItem('mock-likes', JSON.stringify([...likes]));
  localStorage.setItem('mock-saves', JSON.stringify([...saves]));
  localStorage.setItem('mock-follows', JSON.stringify([...follows]));
  localStorage.setItem('mock-reposts', JSON.stringify([...reposts]));
};
let notifications = [
  { _id: 'n1', type: 'new_like', payload: { actorUsername: 'linh_dance', videoId: 'v0' }, isRead: false, createdAt: ago(0.2) },
  { _id: 'n2', type: 'new_follower', payload: { actorUsername: 'trekviet' }, isRead: false, createdAt: ago(1.5) },
  { _id: 'n3', type: 'new_comment', payload: { actorUsername: 'bepnhaminh', videoId: 'v1', message: 'đã bình luận: “Làm tiếp phần 2 đi”' }, isRead: false, createdAt: ago(5) },
  { _id: 'n4', type: 'mention', payload: { actorUsername: 'skatehn', videoId: 'v4' }, isRead: true, createdAt: ago(20) },
  { _id: 'n5', type: 'dubbing_done', payload: { videoId: 'v2', message: 'Bản lồng tiếng English cho “Thử thách 15 giây hôm nay” đã xong' }, isRead: true, createdAt: ago(26) },
];

let me = read('mock-me', null);
const setMe = (u) => { me = u; localStorage.setItem('mock-me', JSON.stringify(u)); };
const meUser = (email, username) => ({ _id: 'me', username, email, avatarUrl: null, bio: '', role: /^admin/.test(email) ? 'admin' : 'user', isVerified: false, followerCount: 128, followingCount: follows.size, videoCount: 0, createdAt: new Date().toISOString() });

const userById = (id) => users.find((u) => u._id === id) || (me && me._id === id ? me : null);
const pubUser = (u) => u && { ...u, isFollowing: follows.has(u._id) };
const pop = (v) => {
  // mô phỏng job xử lý: processing -> ready -> kiểm duyệt
  if (v._t0) {
    const s = (Date.now() - v._t0) / 1000;
    if (v.status === 'processing' && s > 4) v.status = 'ready';
    if (v.status === 'ready' && v.moderationStatus === 'pending' && s > 7) v.moderationStatus = 'approved';
  }
  return {
    ...v, userId: pubUser(userById(v.userId)) || { _id: v.userId, username: 'user' }, isLiked: likes.has(v._id), isSaved: saves.has(v._id),
    isReposted: reposts.has(v._id), repostCount: (v.repostCount || 0) + (reposts.has(v._id) ? 1 : 0), canRepost: true,
    // Demo: video v1 được 2 người bạn theo dõi đăng lại
    repostedBy: v._id === 'v1' ? [users[2], users[6]] : [], repostedByCount: v._id === 'v1' ? 3 : 0,
  };
};
const popC = (c) => ({ ...c, userId: userById(c.userId) || { _id: c.userId, username: 'user' }, isLiked: commentLikes.has(c._id) });
const live = (v) => v.status === 'ready' && v.moderationStatus !== 'removed' && !v.isDraft && (!v.scheduledAt || new Date(v.scheduledAt) <= new Date());
const feedable = () => videos.filter((v) => live(v) && v.visibility === 'public');
const tokens = () => ({ accessToken: 'mock.' + oid(), refreshToken: 'mock-r.' + oid() });

function trackStatus(t) {
  const s = (Date.now() - t.t0) / 1000;
  const status = s < 1.5 ? 'pending' : s < 3.5 ? 'transcribing' : s < 5.5 ? 'translating' : s < 7.5 ? 'synthesizing' : 'done';
  return { ...t, status, transcript: s > 3.5 ? LINES.vi : null, translatedText: s > 5.5 ? LINES[t.targetLang] : null };
}

const ok = (data, status = 200, message = 'Success') => ({ status, data: { success: true, message, data } });
const fail = (message, status = 400) => ({ status, data: { success: false, message } });
const authed = (h) => (me ? h() : fail('Unauthorized', 401));
const findVideo = (id) => videos.find((x) => x._id === id);
const ownVideo = (id, h) => authed(() => { const v = findVideo(id); return !v ? fail('Not found', 404) : v.userId !== me._id ? fail('Forbidden', 403) : h(v); });
const fromForm = (f) => {
  const j = (k, d) => { try { return JSON.parse(f.get(k)); } catch { return d; } };
  const visibility = f.get('visibility') || 'public';
  return {
    title: f.get('title'), description: f.get('description') || '', hashtags: j('hashtags', []), mentions: j('mentions', []),
    visibility, isPrivate: visibility === 'private', allowComment: f.get('allowComment') !== 'false', allowDuet: f.get('allowDuet') !== 'false',
    scheduledAt: f.get('scheduledAt') || null, isDraft: f.get('isDraft') === 'true', sourceLang: f.get('sourceLang') || 'vi',
    autoCaption: f.get('autoCaption') === 'true',
  };
};

const routes = [
  ['post', /^\/auth\/login$/, (b) => {
    if (!b.email || !b.password) return fail('Validation error', 400);
    setMe(me?.email === b.email ? me : meUser(b.email, b.email.split('@')[0].replace(/[^a-zA-Z0-9]/g, '') || 'user'));
    return ok({ user: me, ...tokens() }, 200, 'Đăng nhập thành công');
  }],
  ['post', /^\/auth\/register$/, (b) => {
    if (users.some((u) => u.username === b.username)) return fail('Username đã tồn tại', 409);
    setMe(meUser(b.email, b.username));
    return ok({ user: me, ...tokens() }, 201, 'Đăng ký thành công');
  }],
  ['post', /^\/auth\/refresh$/, () => (me ? ok(tokens()) : fail('Invalid refresh token', 401))],
  ['post', /^\/auth\/logout$/, () => { setMe(null); return ok(null); }],
  ['get', /^\/auth\/me$/, () => authed(() => ok(me))],

  ['get', /^\/feed\/for-you$/, () => ok(feedable().map(pop))],
  ['get', /^\/feed\/following$/, () => authed(() => ok(feedable().filter((v) => follows.has(v.userId)).map(pop)))],

  ['get', /^\/videos\/search$/, (_, p) => { const q = (p.q || '').toLowerCase().replace('#', ''); return ok(feedable().filter((v) => (v.title + ' ' + v.hashtags.join(' ')).toLowerCase().includes(q)).map(pop)); }],
  ['post', /^\/videos$/, (b) => authed(() => {
    const v = { _id: oid(), userId: me._id, originalUrl: null, hlsUrl: null, thumbnailUrl: null, status: 'processing', moderationStatus: 'pending', viewCount: 0, likeCount: 0, commentCount: 0, shareCount: 0, saveCount: 0, visibility: 'public', allowComment: true, allowDuet: true, createdAt: new Date().toISOString(), _t0: Date.now(), ...b };
    videos.unshift(v);
    return ok(v, 201);
  })],
  ['post', /^\/upload$/, (b, p, cfg) => authed(() => {
    const f = cfg.data;
    const thumb = f.get('thumbnail');
    const v = { _id: oid(), userId: me._id, ...fromForm(f), originalUrl: URL.createObjectURL(f.get('video')), hlsUrl: null, thumbnailUrl: thumb ? URL.createObjectURL(thumb) : null, status: 'processing', moderationStatus: 'pending', viewCount: 0, likeCount: 0, commentCount: 0, shareCount: 0, saveCount: 0, createdAt: new Date().toISOString(), _t0: Date.now() };
    videos.unshift(v);
    return ok({ videoId: v._id, jobId: v._id }, 202);
  })],
  ['get', /^\/videos\/([^/]+)$/, (_, p, c, [id]) => { const v = findVideo(id); return v && v.status !== 'failed' ? ok(pop(v)) : fail('Not found', 404); }],
  ['patch', /^\/videos\/([^/]+)$/, (b, p, c, [id]) => ownVideo(id, (v) => {
    Object.assign(v, b, b.visibility ? { isPrivate: b.visibility === 'private' } : {});
    return ok(pop(v));
  })],
  ['post', /^\/videos\/([^/]+)\/like$/, (_, p, c, [id]) => authed(() => {
    const v = findVideo(id);
    likes.has(id) ? (likes.delete(id), v.likeCount--) : (likes.add(id), v.likeCount++);
    persist();
    return ok({ isLiked: likes.has(id), likeCount: v.likeCount });
  })],
  ['post', /^\/videos\/([^/]+)\/save$/, (_, p, c, [id]) => authed(() => {
    const v = findVideo(id);
    saves.has(id) ? (saves.delete(id), v.saveCount--) : (saves.add(id), v.saveCount++);
    persist();
    return ok({ isSaved: saves.has(id), saveCount: v.saveCount });
  })],
  ['post', /^\/videos\/([^/]+)\/share$/, (_, p, c, [id]) => {
    const v = findVideo(id);
    if (!v) return fail('Video not found', 404);
    const counted = !shared.has(id);
    if (counted) { shared.add(id); v.shareCount++; }
    return ok({ shareCount: v.shareCount, counted });
  }],
  ['post', /^\/videos\/([^/]+)\/repost$/, (_, p, c, [id]) => authed(() => {
    const v = findVideo(id);
    if (!v) return fail('Video not found', 404);
    if (v.userId === me._id) return fail('Không thể đăng lại video của chính bạn', 400);
    reposts.has(id) ? reposts.delete(id) : reposts.add(id);
    persist();
    return ok({ reposted: reposts.has(id), repostCount: (v.repostCount || 0) + (reposts.has(id) ? 1 : 0) });
  })],
  ['post', /^\/videos\/([^/]+)\/pin$/, (_, p, c, [id]) => ownVideo(id, (v) => {
    if (!v.pinnedAt && videos.filter((x) => x.pinnedAt && x.userId === v.userId).length >= 3) return fail('Chỉ ghim được tối đa 3 video. Bỏ ghim một video khác trước.', 409);
    v.pinnedAt = v.pinnedAt ? null : new Date().toISOString();
    return ok({ pinned: Boolean(v.pinnedAt), pinnedAt: v.pinnedAt });
  })],
  ['post', /^\/videos\/([^/]+)\/report$/, (b, p, c, [id]) => authed(() => {
    const v = findVideo(id);
    reports.push({ videoId: id, reason: b.reason, note: b.note, at: new Date().toISOString() });
    v.reportCount = (v.reportCount || 0) + 1;
    if (v.reportCount >= 1 && v.moderationStatus === 'approved') { v.moderationStatus = 'flagged'; v.flagReason = b.reason; }
    return ok({ reported: true }, 201);
  })],
  ['post', /^\/videos\/([^/]+)\/view$/, (_, p, c, [id]) => { const v = findVideo(id); if (v) v.viewCount++; return ok(null); }],
  ['delete', /^\/videos\/([^/]+)$/, (_, p, c, [id]) => ownVideo(id, (v) => { v.status = 'failed'; return ok(null, 200, 'Deleted'); })],

  ['get', /^\/comments\/video\/([^/]+)$/, (_, p, c, [id]) => ok(comments.filter((x) => x.videoId === id && !x.parentId).map(popC))],
  ['get', /^\/comments\/([^/]+)\/replies$/, (_, p, c, [id]) => ok(comments.filter((x) => x.parentId === id).map(popC))],
  ['post', /^\/comments$/, (b) => authed(() => {
    const content = b.content || b.text;
    const mentions = [...content.matchAll(/@([a-zA-Z0-9_]{3,30})/g)].map((m) => users.find((u) => u.username === m[1])).filter(Boolean).map((u) => ({ userId: u._id, username: u.username }));
    const cm = { _id: oid(), videoId: b.videoId, userId: me._id, parentId: b.parentId || null, content, mentions, moderationStatus: 'approved', likeCount: 0, replyCount: 0, createdAt: new Date().toISOString() };
    comments.push(cm);
    if (cm.parentId) { const parent = comments.find((x) => x._id === cm.parentId); if (parent) parent.replyCount++; }
    const v = findVideo(b.videoId); if (v) v.commentCount++;
    return ok(popC(cm), 201);
  })],
  ['post', /^\/comments\/([^/]+)\/like$/, (_, p, c, [id]) => authed(() => {
    const cm = comments.find((x) => x._id === id);
    commentLikes.has(id) ? (commentLikes.delete(id), cm.likeCount--) : (commentLikes.add(id), cm.likeCount++);
    return ok({ isLiked: commentLikes.has(id), likeCount: cm.likeCount });
  })],
  ['delete', /^\/comments\/([^/]+)$/, (_, p, c, [id]) => authed(() => { const i = comments.findIndex((x) => x._id === id); if (i > -1) comments.splice(i, 1); return ok(null); })],

  // ── Tag tên, quyền riêng tư, chặn (đặt trước các route /users/:id) ──
  ['get', /^\/users\/mention-suggest$/, (_, p) => {
    const q = String(p.q || '').replace(/^@/, '').toLowerCase();
    return ok(users.filter((u) => u.username.startsWith(q)).slice(0, 8).map(pubUser));
  }],
  ['get', /^\/users\/me\/privacy$/, () => authed(() => ok(privacy))],
  ['patch', /^\/users\/me\/change-password$/, (b) => authed(() => (!b.newPassword || b.newPassword.length < 6 ? fail('Mật khẩu mới phải có ít nhất 6 ký tự', 400) : ok(tokens())))],
  ['patch', /^\/users\/me\/privacy$/, (b) => authed(() => { privacy = { ...privacy, ...b }; return ok(privacy); })],
  ['get', /^\/users\/me\/blocked$/, () => authed(() => ok(users.filter((u) => blockedNames.has(u.username)).map((u) => ({ ...u, blockedAt: new Date().toISOString() }))))],
  ['delete', /^\/users\/me\/followers\/([^/]+)$/, () => authed(() => ok({ removed: true }))],
  ['post', /^\/users\/([^/]+)\/block$/, (_, p, c, [name]) => authed(() => { blockedNames.add(name); return ok({ blocked: true }); })],
  ['delete', /^\/users\/([^/]+)\/block$/, (_, p, c, [name]) => authed(() => { blockedNames.delete(name); return ok({ blocked: false }); })],
  ['get', /^\/users\/([^/]+)\/reposts$/, (_, p, c, [id]) => ok(me && (id === me._id || id === me.username) ? feedable().filter((v) => reposts.has(v._id)).map(pop) : [])],
  ['get', /^\/users\/search$/, (_, p) => ok(users.filter((u) => u.username.includes((p.q || '').toLowerCase().replace('@', ''))).map(pubUser))],
  ['patch', /^\/users\/me$/, (b) => authed(() => { setMe({ ...me, ...b, links: { ...(me.links || {}), ...(b.links || {}) } }); return ok(me); })],
  ['post', /^\/users\/me\/avatar$/, (b, p, cfg) => authed(() => { setMe({ ...me, avatarUrl: URL.createObjectURL(cfg.data.get('avatar')) }); return ok(me); })],
  ['get', /^\/users\/me\/saved$/, () => authed(() => ok(videos.filter((v) => saves.has(v._id) && live(v)).map(pop)))],
  ['get', /^\/users\/me\/drafts$/, () => authed(() => ok(videos.filter((v) => v.userId === me._id && v.isDraft && v.status !== 'failed').map(pop)))],
  ['get', /^\/users\/([^/]+)\/liked$/, (_, p, c, [id]) => (id === me?._id || id === me?.username ? ok(videos.filter((v) => likes.has(v._id) && live(v)).map(pop)) : { status: 403, data: { success: false, code: 'PRIVATE', message: 'Người dùng đã ẩn mục này' } })],
  ['get', /^\/users\/([^/]+)\/videos$/, (_, p, c, [id]) => {
    const mine = me && id === me._id;
    let vs = videos.filter((v) => v.userId === id && v.status !== 'failed' && !v.isDraft && (mine || (live(v) && v.visibility === 'public')));
    if (p.sort === 'popular') vs = [...vs].sort((a, b) => b.viewCount - a.viewCount);
    return ok(vs.map(pop));
  }],
  ['post', /^\/users\/([^/]+)\/follow$/, (_, p, c, [id]) => authed(() => {
    const u = userById(id);
    if (!follows.has(id)) { follows.add(id); u.followerCount++; me.followingCount++; setMe(me); persist(); }
    return ok({ isFollowing: true, followerCount: u.followerCount });
  })],
  ['delete', /^\/users\/([^/]+)\/follow$/, (_, p, c, [id]) => authed(() => {
    const u = userById(id);
    if (follows.has(id)) { follows.delete(id); u.followerCount--; me.followingCount--; setMe(me); persist(); }
    return ok({ isFollowing: false, followerCount: u.followerCount });
  })],
  ['get', /^\/users\/([^/]+)\/followers$/, (_, p) => ok(users.slice(0, 6).filter((u) => !p.q || u.username.includes(p.q)).map((u, i) => ({ ...pubUser(u), followsYou: i % 3 === 0 })))],
  ['get', /^\/users\/([^/]+)\/following$/, (_, p, c, [id]) => ok((id === me?._id ? users.filter((u) => follows.has(u._id)) : users.slice(2, 7)).map(pubUser))],
  ['get', /^\/users\/([^/]+)$/, (_, p, c, [name]) => {
    const u = users.find((x) => x.username === name) || (me?.username === name ? me : null);
    if (!u) return fail('User not found', 404);
    const mine = me && u._id === me._id;
    return ok({ ...pubUser(u), isBlocked: blockedNames.has(u.username), followsYou: !mine && u._id === 'u2',
      access: { followers: true, following: true, liked: mine || privacy.likedVisibility === 'everyone', reposts: true }, ...(mine ? { privacy } : {}), videoCount: videos.filter((v) => v.userId === u._id && live(v)).length, likeTotal: videos.filter((v) => v.userId === u._id).reduce((a, v) => a + v.likeCount, 0) });
  }],

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

  ['get', /^\/admin\/stats$/, () => ok({ users: users.length, videos: videos.length, reports: reports.length, pendingReports: videos.filter((v) => v.moderationStatus === 'flagged').length, pendingComments: 0 })],
  ['get', /^\/admin\/reports$/, () => ok(videos.filter((v) => v.moderationStatus === 'flagged').map((v) => ({ ...pop(v), openReports: v.reportCount || 1, reasonCounts: { [v.flagReason || 'other']: v.reportCount || 1 }, lastReportedAt: ago(1), reports: [] })))],
  ['get', /^\/admin\/comments$/, () => ok([])],
  ['get', /^\/admin\/reports\/(comments|users)$/, () => ok([])],
  ['post', /^\/admin\/reports\/(comments|users)\/([^/]+)\/dismiss$/, () => ok({ resolved: 1 })],
  ['get', /^\/admin\/moderation\/status$/, () => ok({ mode: 'auto', engine: 'keyword', reviewThreshold: 0.5, rejectThreshold: 0.85, reason: 'Chế độ demo (không có AI service)' })],
  ['post', /^\/admin\/users\/([^/]+)\/role$/, (b, p, c, [id]) => { const u = userById(id); if (!u) return fail('User not found', 404); u.role = b.role; return ok(u); }],
  ['post', /^\/admin\/users\/([^/]+)\/unverify$/, (b, p, c, [id]) => { const u = userById(id); if (!u) return fail('User not found', 404); u.isVerified = false; return ok(u); }],
  ['post', /^\/comments\/([^/]+)\/report$/, () => authed(() => ok(null))],
  ['post', /^\/users\/([^/]+)\/report$/, () => authed(() => ok(null))],
  ['post', /^\/admin\/comments\/([^/]+)\/(approve|reject)$/, () => ok(null)],
  ['get', /^\/admin\/users$/, () => ok(users)],
  ['post', /^\/admin\/users\/([^/]+)\/(ban|unban|verify)$/, (_, p, c, [id, act]) => {
    const u = users.find((x) => x._id === id);
    if (act === 'ban') u.bannedAt = new Date().toISOString(); else if (act === 'unban') u.bannedAt = null; else u.isVerified = true;
    return ok(u);
  }],
  ['get', /^\/admin\/videos\/flagged$/, () => ok(videos.filter((v) => v.moderationStatus === 'flagged').map(pop))],
  ['get', /^\/admin\/videos$/, () => ok(videos.filter((v) => v.moderationStatus !== 'removed' && v.status !== 'failed').map(pop))],
  ['delete', /^\/admin\/videos\/([^/]+)$/, (_, p, c, [id]) => { const v = findVideo(id); if (v) v.moderationStatus = 'removed'; return ok(null); }],
  ['post', /^\/admin\/videos\/([^/]+)\/approve$/, (_, p, c, [id]) => { const v = findVideo(id); if (v) { v.moderationStatus = 'approved'; v.flagReason = null; } return ok(null); }],
  ['get', /^\/admin\/audit-logs$/, () => ok(reports.map((r) => ({ action: `Báo cáo video ${r.videoId}: ${r.reason}`, createdAt: r.at })))],
];

export default async function mockAdapter(config) {
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
