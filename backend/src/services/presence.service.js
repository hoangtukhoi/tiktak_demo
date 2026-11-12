/**
 * Trạng thái hoạt động của người dùng (cho trang Quản trị → Người dùng).
 *
 *  - lastActiveAt: lần cuối người dùng gửi request đã đăng nhập hoặc mở / đóng kết nối realtime.
 *    Ghi DB tối đa 1 lần / phút / người (TOUCH_EVERY_MS) để không tốn 1 lệnh ghi mỗi request.
 *  - Đang online: đang mở kết nối Socket.IO (tab TikTak đang mở) HOẶC có hoạt động trong 5 phút gần nhất.
 *
 * Số kết nối socket giữ trong bộ nhớ của tiến trình API (1 tiến trình API là đủ cho dự án này).
 */
const User = require('../models/User');

const ONLINE_WINDOW_MS = 5 * 60 * 1000;
const TOUCH_EVERY_MS = 60 * 1000;

/** userId → số kết nối socket đang mở */
const sockets = new Map();
/** userId → lần ghi lastActiveAt gần nhất (để giới hạn số lần ghi DB) */
const lastSaved = new Map();

const idOf = (u) => String(u?._id || u);

function save(userId, at) {
  try {
    // Không chờ: cập nhật trạng thái không được làm chậm request
    Promise.resolve(User.updateOne({ _id: userId }, { $set: { lastActiveAt: at } })).catch(() => {});
  } catch {
    /* bỏ qua */
  }
}

/** Gọi sau khi xác thực request. user là document vừa đọc từ DB (có sẵn lastActiveAt) */
exports.touch = (user) => {
  if (!user?._id) return;
  const id = idOf(user);
  const now = Date.now();
  const last = Math.max(lastSaved.get(id) || 0, user.lastActiveAt ? new Date(user.lastActiveAt).getTime() : 0);
  if (now - last < TOUCH_EVERY_MS) return;
  lastSaved.set(id, now);
  save(user._id, new Date(now));
};

exports.socketConnected = (userId) => {
  const id = idOf(userId);
  sockets.set(id, (sockets.get(id) || 0) + 1);
  save(id, new Date());
};

exports.socketDisconnected = (userId) => {
  const id = idOf(userId);
  const n = (sockets.get(id) || 0) - 1;
  if (n > 0) sockets.set(id, n);
  else sockets.delete(id);
  // Thời điểm đóng tab = lần hoạt động cuối
  save(id, new Date());
};

/** Danh sách userId đang mở kết nối realtime */
exports.connectedIds = () => [...sockets.keys()];

exports.isOnline = (user) => {
  if (!user) return false;
  if (sockets.has(idOf(user))) return true;
  const last = user.lastActiveAt ? new Date(user.lastActiveAt).getTime() : 0;
  return Date.now() - last < ONLINE_WINDOW_MS;
};

exports.ONLINE_WINDOW_MS = ONLINE_WINDOW_MS;
exports._reset = () => {
  sockets.clear();
  lastSaved.clear();
}; // cho test
