/**
 * Ai được xem một video — gom một chỗ để feed, tìm kiếm, trang video, bình luận, lưu, đăng lại...
 * dùng chung một luật.
 *
 * Video "đang hiển thị" (live): đã xử lý xong, không phải bản nháp, đã tới giờ đăng (nếu hẹn giờ),
 * không bị gỡ. Sau đó tuỳ visibility:
 *   public  → mọi người
 *   friends → chủ video + bạn bè (theo dõi lẫn nhau)
 *   private → chỉ chủ video
 * Chủ video và admin/moderator luôn xem được (trừ video đã xoá).
 */
const Follow = require('../models/Follow');

/** Điều kiện MongoDB cho video công khai (mọi người xem được) */
const publicMatch = (now = new Date()) => ({
  status: 'ready',
  isPrivate: false,
  isDraft: { $ne: true },
  // scheduledAt null / không có / đã qua → được hiện
  scheduledAt: { $not: { $gt: now } },
  // Tài khoản bị khoá → nội dung ẩn với mọi người cho tới khi mở khoá
  authorBanned: { $ne: true },
});

/** Video đang hiển thị (chưa xét visibility) */
const isLive = (v, now = new Date()) =>
  Boolean(v) &&
  v.status === 'ready' &&
  !v.isDraft &&
  !v.authorBanned &&
  v.moderationStatus !== 'removed' &&
  !(v.scheduledAt && new Date(v.scheduledAt) > now);

// isPrivate là cờ "không công khai" được mọi truy vấn cũ dùng: nếu ai đó chỉ đặt isPrivate=true
// (script, admin, client cũ) mà visibility vẫn 'public' thì coi là riêng tư.
const visibilityOf = (v) => {
  if (!v) return 'public';
  if (v.isPrivate && (!v.visibility || v.visibility === 'public')) return 'private';
  return v.visibility || 'public';
};

/** Công khai với mọi người */
const isPublicVideo = (v) => isLive(v) && visibilityOf(v) === 'public';

const idOf = (x) => String(x?._id || x);

/** Hai người theo dõi lẫn nhau? */
async function areFriends(a, b) {
  if (!a || !b) return false;
  const n = await Follow.countDocuments({
    $or: [
      { followerId: a, followingId: b },
      { followerId: b, followingId: a },
    ],
  });
  return n >= 2;
}

/**
 * Người xem có xem được video không (không xét chặn — privacy.service lo phần đó).
 * @param {Object} v       video (userId có thể đã populate)
 * @param {string} viewerId
 * @param {string} role    'admin' | 'moderator' | 'user'
 */
async function canView(v, viewerId, role) {
  if (!v || v.status === 'deleted') return false;
  const owner = idOf(v.userId);
  if (viewerId && owner === String(viewerId)) return true;
  if (role === 'admin' || role === 'moderator') return true;
  if (!isLive(v)) return false;
  const vis = visibilityOf(v);
  if (vis === 'public') return true;
  if (vis === 'friends') return areFriends(viewerId, owner);
  return false;
}

/** Danh sách userId là bạn bè (theo dõi lẫn nhau) của userId */
async function friendIds(userId) {
  if (!userId) return [];
  const following = await Follow.find({ followerId: userId }).select('followingId').lean();
  if (!following.length) return [];
  const back = await Follow.find({ followerId: { $in: following.map((f) => f.followingId) }, followingId: userId })
    .select('followerId')
    .lean();
  return back.map((f) => f.followerId);
}

module.exports = { publicMatch, isLive, isPublicVideo, visibilityOf, canView, areFriends, friendIds };
