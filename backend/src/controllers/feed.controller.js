const videoService = require('../services/video.service');
const { paginated } = require('../utils/apiResponse');

/**
 * GET /api/feed/foryou?cursor=&limit=
 *
 * "For You" feed: a blend of trending videos and content from followed users
 * (for authenticated viewers). Anonymous users receive pure trending content.
 *
 * Query params:
 *   cursor {string}  — last _id from the previous page (omit for first page)
 *   limit  {number}  — number of items to return (default 20)
 */
exports.getForYouFeed = async (req, res) => {
  const { cursor } = req.query;
  const limit = Number(req.query.limit) || 20;

  // req.user may be undefined when optionalAuth is used
  const userId = req.user?._id;

  const result = await videoService.getForYouFeed(userId, cursor, limit);

  paginated(res, result.videos, { nextCursor: result.nextCursor });
};

/**
 * GET /api/feed/following?cursor=&limit=
 *
 * Shows the most recent videos from accounts the authenticated user follows,
 * sorted newest-first with cursor-based pagination.
 *
 * Query params:
 *   cursor {string}  — last _id from the previous page (omit for first page)
 *   limit  {number}  — number of items to return (default 20)
 */
exports.getFollowingFeed = async (req, res) => {
  const { cursor } = req.query;
  const limit = Number(req.query.limit) || 20;

  const result = await videoService.getFollowingFeed(req.user._id, cursor, limit);

  paginated(res, result.videos, { nextCursor: result.nextCursor });
};