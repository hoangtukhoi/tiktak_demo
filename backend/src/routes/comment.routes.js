const express = require('express');
const router = express.Router();
const commentController = require('../controllers/comment.controller');
const { authenticate, optionalAuth } = require('../middlewares/auth.middleware');
const { commentLimiter, reactionLimiter, reportLimiter } = require('../middlewares/rateLimit.middleware');
// optionalAuth: có đăng nhập thì trả isLiked và thấy bình luận chờ duyệt của chính mình
router.get('/video/:videoId', optionalAuth, commentController.getComments);
router.get('/:id/replies', optionalAuth, commentController.getReplies);
router.post('/', authenticate, commentLimiter, commentController.createComment);
router.delete('/:id', authenticate, commentController.deleteComment);
router.post('/:id/like', authenticate, reactionLimiter, commentController.likeComment);
// Báo cáo bình luận vi phạm (mỗi người 1 lần / bình luận)
router.post('/:id/report', authenticate, reportLimiter, commentController.reportComment);
module.exports = router;