/**
 * Escape ký tự đặc biệt để dùng chuỗi người dùng nhập trong RegExp an toàn
 * (tránh lỗi cú pháp regex và ReDoS).
 */
module.exports = (str = '') => String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
