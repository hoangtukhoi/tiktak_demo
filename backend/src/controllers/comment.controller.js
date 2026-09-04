const Comment = require('../models/Comment');
const { success } = require('../utils/apiResponse');
exports.getComments = async (req, res) => {
  const comments = await Comment.find({ videoId: req.params.videoId });
  success(res, comments);
};
exports.getReplies = async (req, res) => { success(res, []); };
exports.createComment = async (req, res) => {
  const comment = await Comment.create({ userId: req.user._id, videoId: req.body.videoId, text: req.body.text });
  success(res, comment, 201);
};
exports.deleteComment = async (req, res) => {
  await Comment.findByIdAndDelete(req.params.id);
  success(res, null);
};
exports.likeComment = async (req, res) => { success(res, null); };