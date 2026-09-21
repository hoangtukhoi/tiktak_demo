const express = require('express');

const router = express.Router();
const commentController = require('../controllers/comment.controller');
const { authenticate, optionalAuth } = require('../middlewares/auth.middleware');
const validate = require('../middlewares/validate.middleware');
const { createCommentSchema } = require('../validators/video.validator');

router.get('/video/:videoId', optionalAuth, commentController.getComments);
router.get('/:id/replies', optionalAuth, commentController.getReplies);
router.post('/', authenticate, validate(createCommentSchema), commentController.createComment);
router.delete('/:id', authenticate, commentController.deleteComment);
router.post('/:id/like', authenticate, commentController.likeComment);

module.exports = router;
