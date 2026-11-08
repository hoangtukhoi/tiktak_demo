const express = require('express');
const router = express.Router();
const commentController = require('../controllers/comment.controller');
const { authenticate, optionalAuth } = require('../middlewares/auth.middleware');
// optionalAuth: có đăng nhập thì trả isLiked và thấy bình luận chờ duyệt của chính mình
router.get('/video/:videoId', optionalAuth, commentController.getComments);
router.get('/:id/replies', optionalAuth, commentController.getReplies);
router.post('/', authenticate, commentController.createComment);
router.delete('/:id', authenticate, commentController.deleteComment);
router.post('/:id/like', authenticate, commentController.likeComment);
module.exports = router;