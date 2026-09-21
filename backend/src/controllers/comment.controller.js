const commentService = require('../services/comment.service');
const { success } = require('../utils/apiResponse');

exports.createComment = async (req, res) => {
  const comment = await commentService.createComment(req.user._id, req.body);
  success(res, comment, 201, 'Đã đăng bình luận');
};

exports.getComments = async (req, res) => {
  success(
    res,
    await commentService.getComments(req.params.videoId, {
      cursor: req.query.cursor,
      limit: req.query.limit,
      currentUserId: req.user?._id,
    })
  );
};

exports.getReplies = async (req, res) => {
  success(
    res,
    await commentService.getReplies(req.params.id, {
      cursor: req.query.cursor,
      limit: req.query.limit,
      currentUserId: req.user?._id,
    })
  );
};

exports.deleteComment = async (req, res) => {
  await commentService.deleteComment(req.params.id, req.user._id);
  success(res, null, 200, 'Đã xoá bình luận');
};

exports.likeComment = async (req, res) => {
  success(res, await commentService.toggleLike(req.params.id, req.user._id));
};
