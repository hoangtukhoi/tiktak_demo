/**
 * Analytics Service — số liệu cho trang phân tích của Admin và của từng Creator.
 *
 * Nguồn dữ liệu:
 *  - User / Video / Like / Comment / Report / AuditLog: dùng createdAt sẵn có
 *  - ViewEvent  : lượt xem chi tiết (thời gian xem, xem hết, nguồn) — có từ khi bật tính năng này
 *  - FollowEvent: lịch sử follow/unfollow
 *
 * Tất cả mốc ngày được chia theo múi giờ ANALYTICS_TZ (mặc định Asia/Ho_Chi_Minh).
 * Kết quả được cache Redis vài phút vì các phép aggregate khá nặng.
 */
const mongoose = require('mongoose');
const redis = require('../config/redis');
const User = require('../models/User');
const Video = require('../models/Video');
const Like = require('../models/Like');
const Comment = require('../models/Comment');
const Report = require('../models/Report');
const AuditLog = require('../models/AuditLog');
const ViewEvent = require('../models/ViewEvent');
const FollowEvent = require('../models/FollowEvent');
const Follow = require('../models/Follow');
const ProfileViewEvent = require('../models/ProfileViewEvent');
const ShareEvent = require('../models/ShareEvent');
const { transcodeQueue } = require('../jobs/queue');

const TZ = process.env.ANALYTICS_TZ || 'Asia/Ho_Chi_Minh';
const DAY = 86400000;
const SOURCES = ['for_you', 'following', 'profile', 'search', 'direct', 'other'];

// ── Tiện ích thời gian ──────────────────────────────────────────────────────

const dayKeyFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const dayKey = (d) => dayKeyFmt.format(d); // "2026-11-01"

const partsFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
});
/** Độ lệch (ms) giữa giờ địa phương theo TZ và UTC tại thời điểm `d` */
function tzOffsetMs(d) {
  const p = Object.fromEntries(partsFmt.formatToParts(d).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUtc - Math.floor(d.getTime() / 1000) * 1000;
}
/** 00:00 (giờ địa phương theo TZ) của ngày chứa `d`, trả về Date (UTC) */
function startOfLocalDay(d) {
  const [y, m, day] = dayKey(d).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, day) - tzOffsetMs(d));
}

/** Cửa sổ thời gian: `days` ngày gần nhất (tính cả hôm nay) và kỳ liền trước cùng độ dài. */
function windowOf(days) {
  const now = new Date();
  const start = new Date(startOfLocalDay(now).getTime() - (days - 1) * DAY);
  const prevStart = new Date(start.getTime() - days * DAY);
  const keys = Array.from({ length: days }, (_, i) => dayKey(new Date(start.getTime() + i * DAY + 12 * 3600000)));
  return { now, start, prevStart, days, keys };
}

const ALLOWED_RANGES = [7, 28, 30, 60, 90, 365];
exports.parseRange = (raw, fallback = 28) => {
  const n = parseInt(raw, 10);
  return ALLOWED_RANGES.includes(n) ? n : fallback;
};

const pctChange = (cur, prev) => (prev > 0 ? Math.round(((cur - prev) / prev) * 1000) / 10 : cur > 0 ? null : 0);
const metric = (cur, prev) => ({
  value: cur,
  previous: prev,
  delta: cur === null || prev === null ? null : Math.round((cur - prev) * 10) / 10,
  change: cur === null || prev === null ? null : pctChange(cur, prev),
});
const MIN_VIEWS_FOR_RATE = 30;
const rate = (part, views) => (views >= MIN_VIEWS_FOR_RATE ? Math.round((part / views) * 1000) / 10 : null);

/** Đếm theo ngày → Map(dayKey → count) */
async function countByDay(Model, match, { dateField = 'createdAt', distinctField = null } = {}) {
  const dateExpr = { $dateToString: { format: '%Y-%m-%d', date: `$${dateField}`, timezone: TZ } };
  const pipeline = [{ $match: match }];
  if (distinctField) {
    pipeline.push(
      { $group: { _id: { d: dateExpr, u: `$${distinctField}` } } },
      { $group: { _id: '$_id.d', n: { $sum: 1 } } }
    );
  } else {
    pipeline.push({ $group: { _id: dateExpr, n: { $sum: 1 } } });
  }
  const rows = await Model.aggregate(pipeline);
  return new Map(rows.map((r) => [r._id, r.n]));
}

const fill = (keys, map) => keys.map((k) => map.get(k) || 0);
const range = (from, to = new Date()) => ({ $gte: from, $lt: to });

async function cached(key, ttlSec, fn) {
  try {
    const hit = await redis.get(key);
    if (hit) return JSON.parse(hit);
  } catch {
    /* Redis lỗi → tính trực tiếp */
  }
  const value = await fn();
  redis.set(key, JSON.stringify(value), 'EX', ttlSec).catch(() => {});
  return value;
}

/** Thống kê thời gian xem từ một tập ViewEvent */
async function watchStats(match) {
  const [row] = await ViewEvent.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        views: { $sum: 1 },
        avgWatchMs: { $avg: '$watchTimeMs' },
        totalWatchMs: { $sum: '$watchTimeMs' },
        completed: { $sum: { $cond: ['$completed', 1, 0] } },
        avgRatio: { $avg: '$watchedRatio' },
      },
    },
  ]);
  if (!row) return { views: 0, avgWatchSec: 0, totalWatchSec: 0, totalWatchHours: 0, completionRate: 0, avgWatchedPct: 0 };
  return {
    views: row.views,
    avgWatchSec: Math.round((row.avgWatchMs / 1000) * 10) / 10,
    totalWatchSec: Math.round(row.totalWatchMs / 1000),
    totalWatchHours: Math.round((row.totalWatchMs / 3600000) * 10) / 10,
    completionRate: Math.round((row.completed / row.views) * 1000) / 10,
    avgWatchedPct: Math.round(row.avgRatio * 1000) / 10,
  };
}

async function sourceBreakdown(match) {
  const rows = await ViewEvent.aggregate([{ $match: match }, { $group: { _id: '$source', n: { $sum: 1 } } }]);
  const total = rows.reduce((a, r) => a + r.n, 0);
  return SOURCES.map((s) => {
    const n = rows.find((r) => r._id === s)?.n || 0;
    return { source: s, views: n, pct: total ? Math.round((n / total) * 1000) / 10 : 0 };
  }).filter((r) => r.views > 0 || ['for_you', 'following', 'profile', 'search'].includes(r.source));
}

/** % người xem còn ở lại tại mỗi mốc 0%, 10%, ... 100% thời lượng video */
async function retentionCurve(match) {
  const rows = await ViewEvent.aggregate([
    { $match: { ...match, videoDurationMs: { $gt: 0 } } },
    { $project: { b: { $floor: { $multiply: ['$watchedRatio', 10] } } } },
    { $group: { _id: '$b', n: { $sum: 1 } } },
  ]);
  const total = rows.reduce((a, r) => a + r.n, 0);
  if (!total) return [];
  // số người xem đạt tối thiểu mốc t = tổng các bucket ≥ t
  return Array.from({ length: 11 }, (_, i) => {
    const reached = rows.filter((r) => r._id >= i).reduce((a, r) => a + r.n, 0);
    return { at: i * 10, pct: i === 0 ? 100 : Math.round((reached / total) * 1000) / 10 };
  });
}

/** Bản đồ nhiệt: số lượt xem theo [thứ][giờ] (thứ 0 = Thứ 2) */
async function activityHeatmap(match) {
  const rows = await ViewEvent.aggregate([
    { $match: match },
    {
      $group: {
        _id: {
          d: { $isoDayOfWeek: { date: '$createdAt', timezone: TZ } }, // 1 = Thứ 2 … 7 = CN
          h: { $hour: { date: '$createdAt', timezone: TZ } },
        },
        n: { $sum: 1 },
      },
    },
  ]);
  const grid = Array.from({ length: 7 }, () => Array(24).fill(0));
  rows.forEach((r) => {
    grid[r._id.d - 1][r._id.h] = r.n;
  });
  // Gợi ý giờ đăng: 3 khung giờ đông người xem nhất
  const hourTotals = Array.from({ length: 24 }, (_, h) => grid.reduce((a, row) => a + row[h], 0));
  const bestHours = hourTotals
    .map((n, h) => ({ h, n }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n)
    .slice(0, 3)
    .map((x) => x.h);
  return { grid, bestHours };
}

// ═════════════════════════════════════════════════════════════════════════════
// ADMIN
// ═════════════════════════════════════════════════════════════════════════════

exports.getAdminAnalytics = (days) => cached(`analytics:v3:admin:${days}`, 300, () => buildAdmin(days));

async function buildAdmin(days) {
  const w = windowOf(days);
  const cur = range(w.start);
  const prev = range(w.prevStart, w.start);
  const videoMatch = { status: { $ne: 'deleted' } };

  const [
    newUsers, newUsersPrev,
    newVideos, newVideosPrev,
    views, viewsPrev,
    likes, likesPrev,
    comments, commentsPrev,
    activeViewerIds, activeViewerIdsPrev, loggedIn, loggedInPrev,
    totalUsers, totalVideos, totalViewsAgg,
  ] = await Promise.all([
    User.countDocuments({ createdAt: cur }), User.countDocuments({ createdAt: prev }),
    Video.countDocuments({ ...videoMatch, createdAt: cur }), Video.countDocuments({ ...videoMatch, createdAt: prev }),
    ViewEvent.countDocuments({ createdAt: cur }), ViewEvent.countDocuments({ createdAt: prev }),
    Like.countDocuments({ targetType: 'video', createdAt: cur }), Like.countDocuments({ targetType: 'video', createdAt: prev }),
    Comment.countDocuments({ isDeleted: false, createdAt: cur }), Comment.countDocuments({ isDeleted: false, createdAt: prev }),
    ViewEvent.distinct('viewerId', { createdAt: cur, viewerId: { $ne: null } }),
    ViewEvent.distinct('viewerId', { createdAt: prev, viewerId: { $ne: null } }),
    User.distinct('_id', { lastLoginAt: cur }),
    User.distinct('_id', { lastLoginAt: prev }),
    User.countDocuments(), Video.countDocuments(videoMatch),
    Video.aggregate([{ $match: videoMatch }, { $group: { _id: null, n: { $sum: '$viewCount' } } }]),
  ]);

  const union = (a, b) => new Set([...a, ...b].map(String)).size;
  const activeUsers = union(activeViewerIds, loggedIn);
  const activeUsersPrev = union(activeViewerIdsPrev, loggedInPrev);

  // ── Chuỗi theo ngày ──
  const [sUsers, sVideos, sViews, sLikes, sComments, sDau, sReports] = await Promise.all([
    countByDay(User, { createdAt: cur }),
    countByDay(Video, { ...videoMatch, createdAt: cur }),
    countByDay(ViewEvent, { createdAt: cur }),
    countByDay(Like, { targetType: 'video', createdAt: cur }),
    countByDay(Comment, { isDeleted: false, createdAt: cur }),
    countByDay(ViewEvent, { createdAt: cur, viewerId: { $ne: null } }, { distinctField: 'viewerId' }),
    countByDay(Report, { createdAt: cur }),
  ]);
  const series = w.keys.map((date, i) => {
    const v = sViews.get(date) || 0;
    const l = sLikes.get(date) || 0;
    const c = sComments.get(date) || 0;
    return {
      date,
      newUsers: sUsers.get(date) || 0,
      newVideos: sVideos.get(date) || 0,
      views: v,
      likes: l,
      comments: c,
      activeViewers: sDau.get(date) || 0,
      reports: sReports.get(date) || 0,
      engagementRate: v >= 10 ? Math.round(((l + c) / v) * 1000) / 10 : null,
    };
  });

  const [topVideos, topCreators, hashtags, moderation, pipeline, watch, sources] = await Promise.all([
    adminTopVideos(cur),
    adminTopCreators(cur),
    adminHashtags(cur),
    adminModeration(cur, w.keys),
    adminPipeline(cur),
    watchStats({ createdAt: cur }),
    sourceBreakdown({ createdAt: cur }),
  ]);

  return {
    range: days,
    timezone: TZ,
    generatedAt: new Date().toISOString(),
    summary: {
      newUsers: metric(newUsers, newUsersPrev),
      activeUsers: metric(activeUsers, activeUsersPrev),
      newVideos: metric(newVideos, newVideosPrev),
      views: metric(views, viewsPrev),
      likes: metric(likes, likesPrev),
      comments: metric(comments, commentsPrev),
      // Chỉ tính khi đủ lượt xem: lượt xem chi tiết (ViewEvent) có thể mới bắt đầu ghi,
      // trong khi like/comment đã có từ trước → chia ra số vô nghĩa (VD 900%)
      engagementRate: metric(rate(likes + comments, views), rate(likesPrev + commentsPrev, viewsPrev)),
    },
    totals: { users: totalUsers, videos: totalVideos, views: totalViewsAgg[0]?.n || 0 },
    watch,
    sources,
    series,
    topVideos,
    topCreators,
    hashtags,
    moderation,
    pipeline,
  };
}

async function adminTopVideos(cur) {
  let rows = await ViewEvent.aggregate([
    { $match: { createdAt: cur } },
    { $group: { _id: '$videoId', views: { $sum: 1 }, avgWatchMs: { $avg: '$watchTimeMs' }, completed: { $sum: { $cond: ['$completed', 1, 0] } } } },
    { $sort: { views: -1 } },
    { $limit: 10 },
  ]);
  let basis = 'period';
  if (!rows.length) {
    // Chưa có ViewEvent trong kỳ → xếp theo tổng lượt xem tích luỹ
    const vids = await Video.find({ status: 'ready' }).sort({ viewCount: -1 }).limit(10).select('_id viewCount').lean();
    rows = vids.map((v) => ({ _id: v._id, views: v.viewCount }));
    basis = 'all_time';
  }
  const videos = await Video.find({ _id: { $in: rows.map((r) => r._id) } })
    .select('title thumbnailUrl likeCount commentCount viewCount userId createdAt moderationStatus')
    .populate('userId', 'username displayName avatarUrl isVerified')
    .lean();
  const byId = new Map(videos.map((v) => [String(v._id), v]));
  return {
    basis,
    items: rows
      .map((r) => {
        const v = byId.get(String(r._id));
        if (!v) return null;
        return {
          _id: v._id,
          title: v.title,
          thumbnailUrl: v.thumbnailUrl,
          author: v.userId,
          views: r.views,
          likes: v.likeCount,
          comments: v.commentCount,
          avgWatchSec: r.avgWatchMs ? Math.round(r.avgWatchMs / 100) / 10 : null,
          completionRate: r.completed !== undefined && r.views ? Math.round((r.completed / r.views) * 1000) / 10 : null,
          moderationStatus: v.moderationStatus,
        };
      })
      .filter(Boolean),
  };
}

async function adminTopCreators(cur) {
  const [byViews, byFollows] = await Promise.all([
    ViewEvent.aggregate([
      { $match: { createdAt: cur } },
      { $group: { _id: '$creatorId', views: { $sum: 1 } } },
      { $sort: { views: -1 } },
      { $limit: 10 },
    ]),
    FollowEvent.aggregate([
      { $match: { createdAt: cur } },
      { $group: { _id: '$followingId', net: { $sum: { $cond: [{ $eq: ['$action', 'follow'] }, 1, -1] } } } },
    ]),
  ]);
  let ids = byViews.map((r) => r._id);
  let basis = 'period';
  if (!ids.length) {
    const users = await User.find({ bannedAt: null }).sort({ followerCount: -1 }).limit(10).select('_id').lean();
    ids = users.map((u) => u._id);
    basis = 'all_time';
  }
  const users = await User.find({ _id: { $in: ids } })
    .select('username displayName avatarUrl isVerified followerCount videoCount')
    .lean();
  const byId = new Map(users.map((u) => [String(u._id), u]));
  const netMap = new Map(byFollows.map((r) => [String(r._id), r.net]));
  const viewsMap = new Map(byViews.map((r) => [String(r._id), r.views]));
  return {
    basis,
    items: ids
      .map((id) => {
        const u = byId.get(String(id));
        if (!u) return null;
        return { ...u, views: viewsMap.get(String(id)) || 0, newFollowers: netMap.get(String(id)) || 0 };
      })
      .filter(Boolean),
  };
}

async function adminHashtags(cur) {
  const rows = await Video.aggregate([
    { $match: { status: 'ready', isPrivate: false, createdAt: cur } },
    { $unwind: '$hashtags' },
    { $group: { _id: '$hashtags', videos: { $sum: 1 }, views: { $sum: '$viewCount' }, likes: { $sum: '$likeCount' } } },
    { $sort: { videos: -1, views: -1 } },
    { $limit: 12 },
  ]);
  return rows.map((r) => ({ tag: r._id, videos: r.videos, views: r.views, likes: r.likes }));
}

async function adminModeration(cur, keys) {
  const [byReason, pendingFlagged, bannedUsers, reportsTotal, actions, resolved] = await Promise.all([
    Report.aggregate([{ $match: { createdAt: cur } }, { $group: { _id: '$reason', n: { $sum: 1 } } }]),
    Video.countDocuments({ moderationStatus: 'flagged' }),
    User.countDocuments({ bannedAt: { $ne: null } }),
    Report.countDocuments({ createdAt: cur }),
    AuditLog.aggregate([{ $match: { createdAt: cur } }, { $group: { _id: '$action', n: { $sum: 1 } } }]),
    AuditLog.find({ createdAt: cur, action: { $in: ['remove_video', 'approve_video'] }, targetType: 'video' })
      .select('targetId createdAt')
      .lean(),
  ]);

  // Thời gian xử lý: từ báo cáo đầu tiên của video tới lúc admin gỡ/duyệt
  let avgResolveHours = null;
  if (resolved.length) {
    const firstReports = await Report.aggregate([
      { $match: { videoId: { $in: resolved.map((r) => r.targetId) } } },
      { $group: { _id: '$videoId', first: { $min: '$createdAt' } } },
    ]);
    const firstMap = new Map(firstReports.map((r) => [String(r._id), r.first]));
    const diffs = resolved
      .map((a) => {
        const f = firstMap.get(String(a.targetId));
        return f && a.createdAt > f ? (a.createdAt - f) / 3600000 : null;
      })
      .filter((x) => x !== null);
    if (diffs.length) avgResolveHours = Math.round((diffs.reduce((a, b) => a + b, 0) / diffs.length) * 10) / 10;
  }

  const REASONS = ['spam', 'violence', 'sexual', 'other'];
  return {
    reportsTotal,
    pendingFlagged,
    bannedUsers,
    avgResolveHours,
    resolvedCount: resolved.length,
    reportsByReason: REASONS.map((r) => ({ reason: r, count: byReason.find((x) => x._id === r)?.n || 0 })),
    actions: Object.fromEntries(actions.map((a) => [a._id, a.n])),
  };
}

async function adminPipeline(cur) {
  const [statusAll, statusPeriod, readyDocs, queue] = await Promise.all([
    Video.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
    Video.aggregate([{ $match: { createdAt: cur } }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
    // Thời gian xử lý ≈ updatedAt - createdAt của video đã sẵn sàng (lấy mẫu 500 video gần nhất)
    Video.find({ createdAt: cur, status: 'ready', originalUrl: { $ne: null } })
      .sort({ createdAt: -1 })
      .limit(500)
      .select('createdAt updatedAt')
      .lean(),
    transcodeQueue
      .getJobCounts('waiting', 'active', 'delayed', 'failed', 'completed')
      .catch(() => null),
  ]);
  const toObj = (rows) => Object.fromEntries(rows.map((r) => [r._id, r.n]));
  const period = toObj(statusPeriod);
  const uploads = Object.values(period).reduce((a, b) => a + b, 0) - (period.deleted || 0);
  const secs = readyDocs.map((d) => (d.updatedAt - d.createdAt) / 1000).filter((s) => s >= 0 && s < 6 * 3600).sort((a, b) => a - b);
  const median = secs.length ? Math.round(secs[Math.floor(secs.length / 2)]) : null;
  const finished = (period.ready || 0) + (period.failed || 0);
  return {
    statusAll: toObj(statusAll),
    statusPeriod: period,
    uploads,
    successRate: finished ? Math.round(((period.ready || 0) / finished) * 1000) / 10 : null,
    medianProcessingSec: median,
    queue,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// CREATOR — trang Phân tích của người dùng, chia 4 tab như TikTok Studio:
// Tổng quan · Nội dung · Người xem · Followers. Mỗi tab một API riêng.
// ═════════════════════════════════════════════════════════════════════════════

const MIN_AUDIENCE = 5; // số người xem tối thiểu để hiện "người xem của bạn cũng xem"
const MIN_SOURCE_VIEWS = 20; // lượt xem tối thiểu để hiện nguồn truy cập
const MIN_ACTIVITY_EVENTS = 10; // lượt xem tối thiểu để hiện giờ hoạt động

const oid = (id) => new mongoose.Types.ObjectId(String(id));
const myVideoIds = async (userId) =>
  (await Video.find({ userId, status: { $ne: 'deleted' } }).select('_id').lean()).map((v) => v._id);
const dateRangeOf = (w) => ({ from: w.keys[0], to: w.keys[w.keys.length - 1] });

/** Lượt xem theo [ngày][giờ] + theo thứ trong tuần, và khung giờ/ngày đông nhất */
async function activityByDay(match, keys) {
  const rows = await ViewEvent.aggregate([
    { $match: match },
    {
      $group: {
        _id: {
          d: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: TZ } },
          h: { $hour: { date: '$createdAt', timezone: TZ } },
        },
        n: { $sum: 1 },
      },
    },
  ]);
  const byDay = Object.fromEntries(keys.map((k) => [k, Array(24).fill(0)]));
  const weekday = Array(7).fill(0); // 0 = Thứ 2 … 6 = Chủ nhật
  const hours = Array(24).fill(0);
  let total = 0;
  rows.forEach((r) => {
    if (byDay[r._id.d]) byDay[r._id.d][r._id.h] += r.n;
    const wd = (new Date(`${r._id.d}T12:00:00Z`).getUTCDay() + 6) % 7;
    weekday[wd] += r.n;
    hours[r._id.h] += r.n;
    total += r.n;
  });
  const argmax = (arr) => arr.reduce((best, v, i) => (v > arr[best] ? i : best), 0);
  return {
    total,
    enough: total >= MIN_ACTIVITY_EVENTS,
    byDay,
    weekday,
    hours,
    peak: total ? { weekday: argmax(weekday), hour: argmax(hours) } : null,
  };
}

// ── Tab Tổng quan ───────────────────────────────────────────────────────────

exports.getCreatorOverview = (userId, days) =>
  cached(`analytics:v5:overview:${userId}:${days}`, 120, () => buildOverview(oid(userId), days));

async function buildOverview(userId, days) {
  const w = windowOf(days);
  const cur = range(w.start);
  const prev = range(w.prevStart, w.start);
  const ids = await myVideoIds(userId);

  const q = {
    videoViews: (createdAt) => ({ model: ViewEvent, match: { creatorId: userId, createdAt } }),
    profileViews: (createdAt) => ({ model: ProfileViewEvent, match: { profileUserId: userId, createdAt } }),
    likes: (createdAt) => ({ model: Like, match: { targetType: 'video', targetId: { $in: ids }, createdAt } }),
    comments: (createdAt) => ({ model: Comment, match: { videoId: { $in: ids }, isDeleted: false, userId: { $ne: userId }, createdAt } }),
    shares: (createdAt) => ({ model: ShareEvent, match: { creatorId: userId, createdAt } }),
  };
  const keys = Object.keys(q);

  const [curCounts, prevCounts, seriesMaps, sources, me] = await Promise.all([
    Promise.all(keys.map((k) => q[k](cur).model.countDocuments(q[k](cur).match))),
    Promise.all(keys.map((k) => q[k](prev).model.countDocuments(q[k](prev).match))),
    Promise.all(keys.map((k) => countByDay(q[k](cur).model, q[k](cur).match))),
    sourceBreakdown({ creatorId: userId, createdAt: cur }),
    User.findById(userId).select('followerCount videoCount').lean(),
  ]);

  const summary = Object.fromEntries(keys.map((k, i) => [k, metric(curCounts[i], prevCounts[i])]));
  const series = w.keys.map((date) => Object.fromEntries([['date', date], ...keys.map((k, i) => [k, seriesMaps[i].get(date) || 0])]));

  return {
    range: days,
    timezone: TZ,
    generatedAt: new Date().toISOString(),
    period: dateRangeOf(w),
    summary,
    series,
    sources: { enough: summary.videoViews.value >= MIN_SOURCE_VIEWS, min: MIN_SOURCE_VIEWS, items: sources },
    totals: { followers: me?.followerCount || 0, videos: ids.length },
  };
}

// ── Tab Nội dung ────────────────────────────────────────────────────────────

exports.getCreatorContent = (userId, days) =>
  cached(`analytics:v5:content:${userId}:${days}`, 120, () => buildContent(oid(userId), days));

async function buildContent(userId, days) {
  const w = windowOf(days);
  const cur = range(w.start);
  const videos = await Video.find({ userId, status: { $ne: 'deleted' } })
    .select('_id title thumbnailUrl viewCount likeCount commentCount shareCount createdAt durationMs status isPrivate')
    .sort({ createdAt: -1 })
    .lean();
  const ids = videos.map((v) => v._id);
  const groupCount = (Model, match, field) =>
    Model.aggregate([{ $match: match }, { $group: { _id: `$${field}`, n: { $sum: 1 } } }]).then((rows) => new Map(rows.map((r) => [String(r._id), r.n])));

  const [watchRows, likesMap, commentsMap, sharesMap] = await Promise.all([
    ViewEvent.aggregate([
      { $match: { creatorId: userId, createdAt: cur } },
      { $group: { _id: '$videoId', views: { $sum: 1 }, avgWatchMs: { $avg: '$watchTimeMs' }, completed: { $sum: { $cond: ['$completed', 1, 0] } } } },
    ]),
    groupCount(Like, { targetType: 'video', targetId: { $in: ids }, createdAt: cur }, 'targetId'),
    groupCount(Comment, { videoId: { $in: ids }, isDeleted: false, createdAt: cur }, 'videoId'),
    groupCount(ShareEvent, { creatorId: userId, createdAt: cur }, 'videoId'),
  ]);
  const wm = new Map(watchRows.map((r) => [String(r._id), r]));

  return {
    range: days,
    generatedAt: new Date().toISOString(),
    period: dateRangeOf(w),
    videos: videos.map((v) => {
      const r = wm.get(String(v._id));
      const id = String(v._id);
      return {
        _id: v._id,
        title: v.title,
        thumbnailUrl: v.thumbnailUrl,
        createdAt: v.createdAt,
        status: v.status,
        isPrivate: v.isPrivate,
        durationSec: Math.round((v.durationMs || 0) / 1000),
        totals: { views: v.viewCount, likes: v.likeCount, comments: v.commentCount, shares: v.shareCount },
        period: {
          views: r?.views || 0,
          likes: likesMap.get(id) || 0,
          comments: commentsMap.get(id) || 0,
          shares: sharesMap.get(id) || 0,
          avgWatchSec: r ? Math.round(r.avgWatchMs / 100) / 10 : null,
          completionRate: r?.views ? Math.round((r.completed / r.views) * 1000) / 10 : null,
        },
      };
    }),
  };
}

// ── Tab Người xem ───────────────────────────────────────────────────────────

exports.getCreatorViewers = (userId, days) =>
  cached(`analytics:v5:viewers:${userId}:${days}`, 120, () => buildViewers(oid(userId), days));

async function buildViewers(userId, days) {
  const w = windowOf(days);
  const cur = range(w.start);
  const prev = range(w.prevStart, w.start);
  const viewerMatch = (createdAt) => ({ creatorId: userId, viewerId: { $ne: null }, createdAt });

  // Lần đầu mỗi người xem xem video của kênh → xác định "người xem mới"
  const firstViews = await ViewEvent.aggregate([
    { $match: { creatorId: userId, viewerId: { $ne: null } } },
    { $group: { _id: '$viewerId', first: { $min: '$createdAt' } } },
    { $match: { first: { $gte: w.prevStart } } },
  ]);
  const newCur = firstViews.filter((f) => f.first >= w.start);
  const newPrev = firstViews.filter((f) => f.first < w.start);
  const newByDay = new Map();
  newCur.forEach((f) => {
    const k = dayKey(f.first);
    newByDay.set(k, (newByDay.get(k) || 0) + 1);
  });

  const [viewerIds, viewerIdsPrev, guests, sViewers, activity] = await Promise.all([
    ViewEvent.distinct('viewerId', viewerMatch(cur)),
    ViewEvent.distinct('viewerId', viewerMatch(prev)),
    ViewEvent.countDocuments({ creatorId: userId, viewerId: null, createdAt: cur }),
    countByDay(ViewEvent, viewerMatch(cur), { distinctField: 'viewerId' }),
    activityByDay({ creatorId: userId, createdAt: cur }, w.keys),
  ]);

  // "Nhà sáng tạo / bài đăng mà người xem của bạn cũng đã xem"
  let alsoWatched = { enough: false, min: MIN_AUDIENCE, viewers: viewerIds.length, creators: [], videos: [] };
  if (viewerIds.length >= MIN_AUDIENCE) {
    const sample = viewerIds.slice(0, 5000);
    const base = { viewerId: { $in: sample }, creatorId: { $ne: userId }, createdAt: cur };
    const [cRows, vRows] = await Promise.all([
      ViewEvent.aggregate([
        { $match: base },
        { $group: { _id: '$creatorId', viewers: { $addToSet: '$viewerId' } } },
        { $project: { n: { $size: '$viewers' } } },
        { $sort: { n: -1 } },
        { $limit: 10 },
      ]),
      ViewEvent.aggregate([
        { $match: base },
        { $group: { _id: '$videoId', viewers: { $addToSet: '$viewerId' } } },
        { $project: { n: { $size: '$viewers' } } },
        { $sort: { n: -1 } },
        { $limit: 12 },
      ]),
    ]);
    const [users, vids] = await Promise.all([
      User.find({ _id: { $in: cRows.map((r) => r._id) }, bannedAt: null }).select('username displayName avatarUrl isVerified followerCount').lean(),
      Video.find({ _id: { $in: vRows.map((r) => r._id) }, status: 'ready', isPrivate: false, moderationStatus: { $ne: 'removed' } })
        .select('title thumbnailUrl viewCount userId')
        .populate('userId', 'username displayName')
        .lean(),
    ]);
    const uMap = new Map(users.map((u) => [String(u._id), u]));
    const vMap = new Map(vids.map((v) => [String(v._id), v]));
    alsoWatched = {
      enough: true,
      min: MIN_AUDIENCE,
      viewers: viewerIds.length,
      creators: cRows.map((r) => uMap.get(String(r._id)) && { ...uMap.get(String(r._id)), sharedViewers: r.n }).filter(Boolean),
      videos: vRows.map((r) => vMap.get(String(r._id)) && { ...vMap.get(String(r._id)), sharedViewers: r.n }).filter(Boolean),
    };
  }

  return {
    range: days,
    timezone: TZ,
    generatedAt: new Date().toISOString(),
    period: dateRangeOf(w),
    summary: {
      totalViewers: metric(viewerIds.length, viewerIdsPrev.length),
      newViewers: metric(newCur.length, newPrev.length),
    },
    guestViews: guests,
    series: w.keys.map((date) => ({ date, totalViewers: sViewers.get(date) || 0, newViewers: newByDay.get(date) || 0 })),
    activity,
    alsoWatched,
  };
}

// ── Tab Followers ───────────────────────────────────────────────────────────

exports.getCreatorFollowers = (userId, days) =>
  cached(`analytics:v5:followers:${userId}:${days}`, 120, () => buildFollowers(oid(userId), days));

async function buildFollowers(userId, days) {
  const w = windowOf(days);
  const cur = range(w.start);
  const prev = range(w.prevStart, w.start);
  const fm = (createdAt, action) => ({ followingId: userId, createdAt, action });

  const [me, gained, lost, gainedPrev, lostPrev, sGained, sLost, followerIds] = await Promise.all([
    User.findById(userId).select('followerCount').lean(),
    FollowEvent.countDocuments(fm(cur, 'follow')),
    FollowEvent.countDocuments(fm(cur, 'unfollow')),
    FollowEvent.countDocuments(fm(prev, 'follow')),
    FollowEvent.countDocuments(fm(prev, 'unfollow')),
    countByDay(FollowEvent, fm(cur, 'follow')),
    countByDay(FollowEvent, fm(cur, 'unfollow')),
    Follow.distinct('followerId', { followingId: userId }),
  ]);
  const total = me?.followerCount || 0;

  // Tổng follower cuối mỗi ngày = tổng hiện tại − thay đổi ròng của các ngày sau đó
  const net = w.keys.map((k) => (sGained.get(k) || 0) - (sLost.get(k) || 0));
  const totals = Array(net.length).fill(total);
  for (let i = net.length - 2; i >= 0; i -= 1) totals[i] = Math.max(0, totals[i + 1] - net[i + 1]);

  // Follower hoạt động lúc nào: lượt xem (mọi video trên TikTak) của những người đang theo dõi bạn
  const activity = followerIds.length
    ? await activityByDay({ viewerId: { $in: followerIds.slice(0, 5000) }, createdAt: cur }, w.keys)
    : { total: 0, enough: false, byDay: {}, weekday: Array(7).fill(0), hours: Array(24).fill(0), peak: null };

  return {
    range: days,
    timezone: TZ,
    generatedAt: new Date().toISOString(),
    period: dateRangeOf(w),
    summary: {
      totalFollowers: { value: total },
      netFollowers: metric(gained - lost, gainedPrev - lostPrev),
    },
    gained,
    lost,
    series: w.keys.map((date, i) => ({
      date,
      totalFollowers: totals[i],
      netFollowers: net[i],
      gained: sGained.get(date) || 0,
      lost: sLost.get(date) || 0,
    })),
    activity,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// PHÂN TÍCH TỪNG VIDEO (dùng chung cho creator và admin)
// ═════════════════════════════════════════════════════════════════════════════

const VIDEO_FIELDS = 'title thumbnailUrl viewCount likeCount commentCount shareCount createdAt durationMs status isPrivate userId moderationStatus flagReason reportCount hashtags';
const EARLY_DROP_MS = 3000;
const MIN_VIEWS_FOR_INSIGHT = 10;

/** Người xem duy nhất, lượt xem của khách, tỷ lệ xem lại, tỷ lệ bỏ đi trong 3 giây đầu */
async function audienceStats(match) {
  const [row] = await ViewEvent.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        views: { $sum: 1 },
        viewers: { $addToSet: '$viewerId' },
        guests: { $sum: { $cond: [{ $eq: ['$viewerId', null] }, 1, 0] } },
        rewatch: {
          $sum: {
            $cond: [{ $and: [{ $gt: ['$videoDurationMs', 0] }, { $gt: ['$watchTimeMs', { $multiply: ['$videoDurationMs', 1.05] }] }] }, 1, 0],
          },
        },
        early: { $sum: { $cond: [{ $lt: ['$watchTimeMs', EARLY_DROP_MS] }, 1, 0] } },
      },
    },
  ]);
  if (!row) return { uniqueViewers: 0, guestViews: 0, rewatchRate: 0, earlyDropRate: 0 };
  const pct = (n) => Math.round((n / row.views) * 1000) / 10;
  return {
    uniqueViewers: row.viewers.filter(Boolean).length,
    guestViews: row.guests,
    rewatchRate: pct(row.rewatch),
    earlyDropRate: pct(row.early),
  };
}

/** Lượt xem theo "ngày thứ N kể từ khi đăng" (N = 1..days) — để so sánh video đăng vào thời điểm khác nhau */
async function viewsSincePublish(videoId, publishedAt, days = 14) {
  const rows = await ViewEvent.aggregate([
    { $match: { videoId, createdAt: range(publishedAt, new Date(publishedAt.getTime() + days * DAY)) } },
    { $project: { d: { $floor: { $divide: [{ $subtract: ['$createdAt', publishedAt] }, DAY] } } } },
    { $group: { _id: '$d', n: { $sum: 1 } } },
  ]);
  const map = new Map(rows.map((r) => [r._id, r.n]));
  const age = Math.max(1, Math.min(days, Math.ceil((Date.now() - publishedAt.getTime()) / DAY)));
  return Array.from({ length: age }, (_, i) => ({ day: i + 1, views: map.get(i) || 0 }));
}

/** Trung bình các video KHÁC của cùng kênh trong cùng kỳ — mốc để so sánh */
async function channelBaseline(creatorId, excludeId, cur) {
  const match = { creatorId, videoId: { $ne: excludeId }, createdAt: cur };
  const [watch, audience, otherVideos] = await Promise.all([
    watchStats(match),
    audienceStats(match),
    Video.countDocuments({ userId: creatorId, _id: { $ne: excludeId }, status: 'ready' }),
  ]);
  return {
    videos: otherVideos,
    views: watch.views,
    avgViewsPerVideo: otherVideos ? Math.round((watch.views / otherVideos) * 10) / 10 : null,
    avgWatchSec: watch.avgWatchSec,
    avgWatchedPct: watch.avgWatchedPct,
    completionRate: watch.completionRate,
    earlyDropRate: audience.earlyDropRate,
    rewatchRate: audience.rewatchRate,
    enough: watch.views >= MIN_VIEWS_FOR_INSIGHT,
  };
}

const SOURCE_NAME = { for_you: 'Dành cho bạn', following: 'Đang theo dõi', profile: 'trang cá nhân', search: 'tìm kiếm', direct: 'link trực tiếp', other: 'nguồn khác' };
const secText = (s) => (s < 60 ? `${Math.round(s)} giây` : `${Math.floor(s / 60)} phút ${Math.round(s % 60)} giây`);

/** Nhận xét tự động dựa trên số liệu — type: good | warn | info */
function buildInsights({ watch, audience, retention, sources, baseline, first7Days, durationSec, periodViews }) {
  const out = [];
  if (watch.views < MIN_VIEWS_FOR_INSIGHT) {
    out.push({ type: 'info', text: `Cần ít nhất ${MIN_VIEWS_FOR_INSIGHT} lượt xem trong kỳ để đưa ra nhận xét (hiện có ${watch.views}).` });
    return out;
  }

  // 1. Mở đầu video
  if (audience.earlyDropRate >= 40) {
    out.push({ type: 'warn', text: `${audience.earlyDropRate}% người xem rời đi trong 3 giây đầu — thử mở đầu bằng khoảnh khắc ấn tượng nhất của video.` });
  } else if (audience.earlyDropRate <= 15) {
    out.push({ type: 'good', text: `Mở đầu giữ chân tốt: chỉ ${audience.earlyDropRate}% người xem rời đi trong 3 giây đầu.` });
  }

  // 2. Đoạn mất người xem nhiều nhất
  if (retention.length > 2 && durationSec > 0) {
    let worst = { drop: 0, at: 0 };
    for (let i = 1; i < retention.length; i += 1) {
      const drop = retention[i - 1].pct - retention[i].pct;
      if (i > 1 && drop > worst.drop) worst = { drop, at: retention[i - 1].at };
    }
    if (worst.drop >= 15) {
      const from = (durationSec * worst.at) / 100;
      const to = (durationSec * (worst.at + 10)) / 100;
      out.push({ type: 'info', text: `Mất nhiều người xem nhất ở đoạn ${worst.at}–${worst.at + 10}% thời lượng (khoảng ${secText(from)} – ${secText(to)}): giảm ${Math.round(worst.drop)} điểm %.` });
    }
  }

  // 3. So với trung bình kênh
  if (baseline?.enough) {
    const diff = Math.round((watch.completionRate - baseline.completionRate) * 10) / 10;
    if (diff >= 10) out.push({ type: 'good', text: `Tỷ lệ xem hết ${watch.completionRate}% — cao hơn trung bình kênh (${baseline.completionRate}%).` });
    else if (diff <= -10) out.push({ type: 'warn', text: `Tỷ lệ xem hết ${watch.completionRate}% — thấp hơn trung bình kênh (${baseline.completionRate}%). Có thể rút ngắn video hoặc cắt đoạn chậm.` });
    if (baseline.avgViewsPerVideo) {
      const ratio = periodViews / baseline.avgViewsPerVideo;
      if (ratio >= 1.5) out.push({ type: 'good', text: `Lượt xem gấp ${ratio.toFixed(1)} lần trung bình các video khác của kênh trong cùng kỳ.` });
      else if (ratio <= 0.5) out.push({ type: 'warn', text: `Lượt xem chỉ bằng ${Math.round(ratio * 100)}% trung bình các video khác của kênh trong cùng kỳ.` });
    }
  }

  // 4. Xem lại
  if (audience.rewatchRate >= 15) out.push({ type: 'good', text: `${audience.rewatchRate}% lượt xem có xem lại — nội dung có sức hút khi lặp lại.` });

  // 5. Nguồn lượt xem
  const top = [...sources].sort((a, b) => b.views - a.views)[0];
  if (top?.views) {
    if (top.source === 'for_you' && top.pct >= 60) {
      out.push({ type: 'good', text: `${top.pct}% lượt xem đến từ "Dành cho bạn" — video đang được đề xuất tới người chưa theo dõi bạn.` });
    } else if (['profile', 'following'].includes(top.source) && top.pct >= 50) {
      out.push({ type: 'info', text: `Phần lớn lượt xem (${top.pct}%) đến từ ${SOURCE_NAME[top.source]}, tức người đã biết bạn. Hashtag phù hợp có thể giúp tiếp cận người mới.` });
    } else if (top.source === 'search' && top.pct >= 30) {
      out.push({ type: 'info', text: `${top.pct}% lượt xem đến từ tìm kiếm — tiêu đề và hashtag đang phát huy tác dụng.` });
    }
  }

  // 6. Đà 7 ngày đầu
  const total7 = first7Days.reduce((a, d) => a + d.views, 0);
  if (total7 >= MIN_VIEWS_FOR_INSIGHT && first7Days.length >= 3) {
    const peak = first7Days.reduce((a, d) => (d.views > a.views ? d : a), first7Days[0]);
    if (peak.day >= 3) out.push({ type: 'good', text: `Lượt xem tăng dần và đạt đỉnh vào ngày thứ ${peak.day} sau khi đăng — video vẫn đang được lan toả.` });
  }

  if (!out.length) out.push({ type: 'info', text: 'Các chỉ số của video ở mức bình thường so với kênh.' });
  return out;
}

async function buildVideoAnalytics(video, days, { withAdmin = false } = {}) {
  const w = windowOf(days);
  const vid = video._id;
  const cur = range(w.start);
  const evCur = { videoId: vid, createdAt: cur };

  const first7Keys = Array.from({ length: 7 }, (_, i) => dayKey(new Date(video.createdAt.getTime() + i * DAY)));
  const [sShares, sViews, sViewers, sFirst7, sLikes, sComments, watch, audience, sources, retention, heatmap, baseline] = await Promise.all([
    countByDay(ShareEvent, { videoId: vid, createdAt: cur }),
    countByDay(ViewEvent, evCur),
    countByDay(ViewEvent, { ...evCur, viewerId: { $ne: null } }, { distinctField: 'viewerId' }),
    countByDay(ViewEvent, { videoId: vid, createdAt: range(video.createdAt, new Date(video.createdAt.getTime() + 7 * DAY)) }),
    countByDay(Like, { targetType: 'video', targetId: vid, createdAt: cur }),
    countByDay(Comment, { videoId: vid, isDeleted: false, createdAt: cur }),
    watchStats(evCur),
    audienceStats(evCur),
    sourceBreakdown(evCur),
    retentionCurve(evCur),
    activityHeatmap(evCur),
    channelBaseline(video.userId._id || video.userId, vid, cur),
  ]);

  const series = w.keys.map((date) => {
    const v = sViews.get(date) || 0;
    const l = sLikes.get(date) || 0;
    const c = sComments.get(date) || 0;
    return { date, views: v, uniqueViewers: sViewers.get(date) || 0, likes: l, comments: c, shares: sShares.get(date) || 0, engagement: l + c };
  });
  const likes = series.reduce((a, d) => a + d.likes, 0);
  const comments = series.reduce((a, d) => a + d.comments, 0);
  const shares = series.reduce((a, d) => a + d.shares, 0);
  const first7Days = first7Keys
    .map((date, i) => ({ day: i + 1, date, views: sFirst7.get(date) || 0 }))
    .filter((d) => d.date <= dayKey(new Date()));
  const durationSec = Math.round((video.durationMs || 0) / 1000);

  const result = {
    range: days,
    timezone: TZ,
    generatedAt: new Date().toISOString(),
    video: {
      _id: video._id,
      title: video.title,
      thumbnailUrl: video.thumbnailUrl,
      createdAt: video.createdAt,
      durationSec,
      totalViews: video.viewCount,
      likes: video.likeCount,
      comments: video.commentCount,
      shares: video.shareCount,
      status: video.status,
      isPrivate: video.isPrivate,
      hashtags: video.hashtags || [],
    },
    watch,
    audience,
    engagement: { likes, comments, shares, rate: rate(likes + comments + shares, watch.views) },
    baseline,
    series,
    first7Days,
    sources,
    retention,
    heatmap,
    insights: buildInsights({ watch, audience, retention, sources, baseline, first7Days, durationSec, periodViews: watch.views }),
  };

  if (withAdmin) {
    const reports = await Report.aggregate([
      { $match: { videoId: vid } },
      { $group: { _id: '$reason', n: { $sum: 1 }, last: { $max: '$createdAt' } } },
    ]);
    result.author = video.userId; // đã populate
    result.moderation = {
      status: video.moderationStatus,
      flagReason: video.flagReason,
      reportCount: video.reportCount,
      reportsByReason: ['spam', 'violence', 'sexual', 'other'].map((r) => ({ reason: r, count: reports.find((x) => x._id === r)?.n || 0 })),
      lastReportAt: reports.reduce((a, r) => (!a || r.last > a ? r.last : a), null),
    };
  }
  return result;
}

const notFound = () => Object.assign(new Error('Video not found'), { statusCode: 404 });

/** Creator xem video của chính mình */
exports.getCreatorVideoAnalytics = async (userId, videoId, days) => {
  const video = await Video.findOne({ _id: videoId, userId, status: { $ne: 'deleted' } }).select(VIDEO_FIELDS).lean();
  if (!video) throw notFound();
  return cached(`analytics:v5:video:${videoId}:${days}`, 120, () => buildVideoAnalytics(video, days));
};

/** Admin xem bất kỳ video nào (kèm thông tin tác giả & báo cáo vi phạm) */
exports.getAdminVideoAnalytics = async (videoId, days) => {
  const video = await Video.findById(videoId)
    .select(VIDEO_FIELDS)
    .populate('userId', 'username displayName avatarUrl isVerified followerCount bannedAt')
    .lean();
  if (!video) throw notFound();
  return cached(`analytics:v5:admin-video:${videoId}:${days}`, 120, () => buildVideoAnalytics(video, days, { withAdmin: true }));
};

/** So sánh 2–3 video của chính mình: tính từ lúc đăng, không phụ thuộc khoảng thời gian */
exports.getCreatorCompare = async (userId, ids) => {
  const videos = await Video.find({ _id: { $in: ids }, userId, status: { $ne: 'deleted' } }).select(VIDEO_FIELDS).lean();
  if (videos.length !== ids.length) throw notFound();
  const ordered = ids.map((id) => videos.find((v) => String(v._id) === String(id)));

  return cached(`analytics:v5:compare:${ids.join(',')}`, 120, async () => {
    const items = await Promise.all(
      ordered.map(async (v) => {
        const match = { videoId: v._id };
        const [watch, audience, retention, since, sources] = await Promise.all([
          watchStats(match),
          audienceStats(match),
          retentionCurve(match),
          viewsSincePublish(v._id, v.createdAt, 14),
          sourceBreakdown(match),
        ]);
        return {
          video: {
            _id: v._id,
            title: v.title,
            thumbnailUrl: v.thumbnailUrl,
            createdAt: v.createdAt,
            durationSec: Math.round((v.durationMs || 0) / 1000),
            totalViews: v.viewCount,
            likes: v.likeCount,
            comments: v.commentCount,
            shares: v.shareCount,
          },
          watch,
          audience,
          engagementRate: rate(v.likeCount + v.commentCount, v.viewCount),
          retention,
          sincePublish: since,
          topSource: [...sources].sort((a, b) => b.views - a.views)[0] || null,
        };
      })
    );
    return { generatedAt: new Date().toISOString(), items };
  });
};

exports._internals = { windowOf, dayKey, pctChange, fill, buildInsights };
