/**
 * Link chia sẻ ngắn: GET /s/:id
 *
 * Facebook, Messenger, Zalo... không chạy JavaScript khi đọc link, nên không thấy được
 * tiêu đề/ảnh của trang React. Trang này trả HTML có sẵn thẻ Open Graph (tiêu đề, ảnh bìa)
 * để hiện khung xem trước đẹp, rồi chuyển người xem sang /watch/:id của frontend.
 */
const express = require('express');
const mongoose = require('mongoose');
const Video = require('../models/Video');

const router = express.Router();

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const frontendUrl = () => (process.env.FRONTEND_URL || 'http://localhost:3000').split(',')[0].trim().replace(/\/$/, '');

router.get('/:id', async (req, res) => {
  const { id } = req.params;
  const target = `${frontendUrl()}/watch/${encodeURIComponent(id)}`;
  let video = null;
  if (mongoose.Types.ObjectId.isValid(id)) {
    // Chỉ lộ thông tin video công khai; video riêng tư/đã xoá hiện trang chung chung
    video = await Video.findOne({ _id: id, status: 'ready', isPrivate: false, moderationStatus: { $ne: 'removed' } })
      .select('title description thumbnailUrl userId width height')
      .populate('userId', 'username displayName')
      .lean();
  }
  const author = video?.userId?.displayName || video?.userId?.username;
  const title = video ? `${video.title}${author ? ` — @${video.userId.username}` : ''}` : 'Video trên TikTak';
  const desc = video?.description?.slice(0, 200) || 'Xem video ngắn và lồng tiếng AI trên TikTak';
  const shareUrl = `${process.env.PUBLIC_URL?.replace(/\/$/, '') || `${req.protocol}://${req.get('host')}`}/s/${encodeURIComponent(id)}`;

  res.set('Cache-Control', 'public, max-age=300');
  res.type('html').send(`<!doctype html>
<html lang="vi"><head>
<meta charset="utf-8">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:type" content="video.other">
<meta property="og:site_name" content="TikTak">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(shareUrl)}">
${video?.thumbnailUrl ? `<meta property="og:image" content="${esc(video.thumbnailUrl)}">` : ''}
<meta name="twitter:card" content="summary_large_image">
<meta http-equiv="refresh" content="0;url=${esc(target)}">
</head><body>
<p>Đang mở video… <a href="${esc(target)}">Bấm vào đây nếu không tự chuyển</a>.</p>
<script>location.replace(${JSON.stringify(target).replace(/</g, '\\u003c')})</script>
</body></html>`);
});

module.exports = router;
