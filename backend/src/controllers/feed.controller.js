const videoService = require('../services/video.service');
const { success } = require('../utils/apiResponse');

exports.getForYouFeed = async (req, res) => {
  success(
    res,
    await videoService.getForYouFeed(req.user?._id, {
      cursorScore: req.query.cursor,
      limit: req.query.limit,
    })
  );
};

exports.getFollowingFeed = async (req, res) => {
  success(
    res,
    await videoService.getFollowingFeed(req.user._id, {
      cursor: req.query.cursor,
      limit: req.query.limit,
    })
  );
};
