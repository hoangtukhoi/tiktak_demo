/**
 * Quyền riêng tư & chặn người dùng.
 *
 * Mức hiển thị: everyone (mọi người) | friends (theo dõi lẫn nhau) | only_me (chỉ mình tôi)
 * Chủ tài khoản và admin/moderator luôn xem được mọi thứ.
 * Chặn có hiệu lực 2 chiều: A chặn B thì A và B đều không thấy / tương tác được với nhau.
 */
const Block = require('../models/Block');
const Follow = require('../models/Follow');
const User = require('../models/User');

const DEFAULTS = {
  followersVisibility: 'everyone',
  followingVisibility: 'everyone',
  likedVisibility: 'only_me',
  repostsVisibility: 'everyone',
  commentPermission: 'everyone',
  mentionPermission: 'everyone',
  allowRepost: true,
  discoverable: true,
};

const OPTIONS = {
  followersVisibility: ['everyone', 'friends', 'only_me'],
  followingVisibility: ['everyone', 'friends', 'only_me'],
  likedVisibility: ['everyone', 'only_me'],
  repostsVisibility: ['everyone', 'friends', 'only_me'],
  commentPermission: ['everyone', 'followers', 'friends', 'no_one'],
  mentionPermission: ['everyone', 'following', 'no_one'],
  allowRepost: 'boolean',
  discoverable: 'boolean',
};

/** Cài đặt đầy đủ (tài khoản cũ chưa có trường nào thì lấy mặc định) */
const settingsOf = (user) => ({ ...DEFAULTS, ...(user?.privacy || {}) });

const isStaff = (viewer) => ['admin', 'moderator'].includes(viewer?.role);

/** Kiểm tra dữ liệu PATCH /users/me/privacy → { value } | { error } */
function validate(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Dữ liệu không hợp lệ' };
  const value = {};
  for (const [k, v] of Object.entries(body)) {
    const allowed = OPTIONS[k];
    if (!allowed) return { error: `Không có cài đặt "${k}"` };
    if (allowed === 'boolean' ? typeof v !== 'boolean' : !allowed.includes(v)) {
      return { error: `Giá trị không hợp lệ cho "${k}"` };
    }
    value[k] = v;
  }
  if (!Object.keys(value).length) return { error: 'Không có gì để cập nhật' };
  return { value };
}

/** Có chặn nhau (theo bất kỳ chiều nào) không */
async function isBlockedBetween(a, b) {
  if (!a || !b || String(a) === String(b)) return false;
  return Boolean(await Block.exists({ $or: [{ blockerId: a, blockedId: b }, { blockerId: b, blockedId: a }] }));
}

/** Tập id những người mà userId đã chặn hoặc đã chặn userId */
async function blockedIdSet(userId) {
  if (!userId) return new Set();
  const rows = await Block.find({ $or: [{ blockerId: userId }, { blockedId: userId }] }).select('blockerId blockedId').lean();
  const set = new Set();
  for (const r of rows || []) set.add(String(String(r.blockerId) === String(userId) ? r.blockedId : r.blockerId));
  return set;
}

/**
 * Quan hệ giữa người xem và chủ tài khoản.
 * follows: người xem theo dõi chủ; followedBy: chủ theo dõi người xem
 */
async function relation(viewer, ownerId) {
  const viewerId = viewer?._id;
  const self = Boolean(viewerId && String(viewerId) === String(ownerId));
  if (!viewerId || self) return { self, follows: false, followedBy: false, friends: false, blockedByMe: false, blockedMe: false };
  const [follows, followedBy, blockedByMe, blockedMe] = await Promise.all([
    Follow.exists({ followerId: viewerId, followingId: ownerId }),
    Follow.exists({ followerId: ownerId, followingId: viewerId }),
    Block.exists({ blockerId: viewerId, blockedId: ownerId }),
    Block.exists({ blockerId: ownerId, blockedId: viewerId }),
  ]);
  return {
    self,
    follows: Boolean(follows),
    followedBy: Boolean(followedBy),
    friends: Boolean(follows && followedBy),
    blockedByMe: Boolean(blockedByMe),
    blockedMe: Boolean(blockedMe),
  };
}

/** Mức hiển thị → người xem có được xem không */
function allows(level, rel, viewer) {
  if (rel.self || isStaff(viewer)) return true;
  if (rel.blockedByMe || rel.blockedMe) return false;
  if (level === 'everyone') return true;
  if (level === 'friends') return rel.friends;
  return false;
}

/** Quyền của người xem trên hồ sơ của owner (trả kèm GET /users/:username để giao diện ẩn/khoá) */
function profileAccess(owner, rel, viewer) {
  const s = settingsOf(owner);
  return {
    followers: allows(s.followersVisibility, rel, viewer),
    following: allows(s.followingVisibility, rel, viewer),
    liked: allows(s.likedVisibility, rel, viewer),
    reposts: allows(s.repostsVisibility, rel, viewer),
  };
}

const COMMENT_DENIED = {
  followers: 'Tác giả chỉ cho phép người theo dõi bình luận',
  friends: 'Tác giả chỉ cho phép bạn bè (theo dõi lẫn nhau) bình luận',
  no_one: 'Tác giả đã tắt bình luận',
};

/**
 * Người xem có được bình luận video của owner không.
 * @returns {Promise<{ allowed: boolean, reason?: string }>}
 */
async function commentPolicy(viewer, owner) {
  const ownerId = owner?._id || owner;
  const ownerDoc = owner?.privacy !== undefined ? owner : await User.findById(ownerId).select('privacy').lean();
  const level = settingsOf(ownerDoc).commentPermission;
  if (!viewer) return { allowed: level === 'everyone', ...(level !== 'everyone' && { reason: COMMENT_DENIED[level] }) };
  const rel = await relation(viewer, ownerId);
  if (rel.self || isStaff(viewer)) return { allowed: true };
  if (rel.blockedByMe || rel.blockedMe) return { allowed: false, reason: 'Bạn không thể bình luận video này' };
  const ok = level === 'everyone' || (level === 'followers' && rel.follows) || (level === 'friends' && rel.friends);
  return ok ? { allowed: true } : { allowed: false, reason: COMMENT_DENIED[level] };
}

/**
 * Lọc danh sách người được tag theo cài đặt "Ai được tag tôi" và chặn.
 * @param {Array<{userId, username}>} mentions
 * @param {ObjectId} authorId — người viết nội dung
 */
async function filterMentions(mentions, authorId) {
  if (!mentions.length) return mentions;
  const ids = mentions.map((m) => m.userId);
  const [users, blocked, followsAuthor] = await Promise.all([
    User.find({ _id: { $in: ids } }).select('privacy.mentionPermission').lean(),
    blockedIdSet(authorId),
    Follow.find({ followerId: { $in: ids }, followingId: authorId }).select('followerId').lean(),
  ]);
  const perm = new Map(users.map((u) => [String(u._id), settingsOf(u).mentionPermission]));
  const followers = new Set((followsAuthor || []).map((f) => String(f.followerId)));
  return mentions.filter((m) => {
    const id = String(m.userId);
    if (blocked.has(id)) return false;
    const p = perm.get(id) || 'everyone';
    // "following" = người MÀ TÔI theo dõi được tag tôi → người được tag phải đang theo dõi tác giả
    return p === 'everyone' || (p === 'following' && followers.has(id));
  });
}

module.exports = {
  DEFAULTS,
  OPTIONS,
  settingsOf,
  validate,
  isStaff,
  isBlockedBetween,
  blockedIdSet,
  relation,
  allows,
  profileAccess,
  commentPolicy,
  filterMentions,
};
