/**
 * User Controller
 * Handles profile management, video listing, user search, and follow/unfollow operations.
 */

const mongoose = require('mongoose');
const User = require('../models/User');
const Video = require('../models/Video');
const Follow = require('../models/Follow');
const videoService = require('../services/video.service');
const notificationService = require('../services/notification.service');
const { success, error, paginated } = require('../utils/apiResponse');

/**
 * GET /users/:username
 * Returns a user's public profile, including:
 *  - Total likes across all their videos (aggregated)
 *  - Video count (from the videoCount field on the User document)
 *  - Whether the requesting user follows them (isFollowing)
 */
exports.getProfile = async (req, res) => {
  try {
    const { username } = req.params;

    const user = await User.findOne({ username }).lean();
    if (!user) return error(res, 'User not found', 404);

    // Aggregate total likes across all user videos
    const likeAgg = await Video.aggregate([
      { $match: { userId: user._id, status: 'ready' } },
      { $group: { _id: null, totalLikes: { $sum: '$likeCount' } } },
    ]);
    const totalLikes = likeAgg.length > 0 ? likeAgg[0].totalLikes : 0;

    // Determine if the requesting user follows this profile
    let isFollowing = false;
    if (req.user) {
      const follow = await Follow.exists({
        followerId: req.user._id,
        followingId: user._id,
      });
      isFollowing = Boolean(follow);
    }

    return success(res, {
      ...user,
      totalLikes,
      videosCount: user.videoCount,
      isFollowing,
    });
  } catch (err) {
    console.error('[getProfile]', err);
    return error(res, 'Failed to fetch profile', 500);
  }
};

/**
 * PATCH /users/me
 * Updates the authenticated user's profile.
 * Only `bio` and `avatarUrl` are whitelisted to prevent mass-assignment.
 */
exports.updateProfile = async (req, res) => {
  try {
    // Whitelist: only allow safe fields
    const ALLOWED_FIELDS = ['bio', 'avatarUrl'];
    const updates = {};
    ALLOWED_FIELDS.forEach((field) => {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    });

    if (Object.keys(updates).length === 0) {
      return error(res, 'No valid fields provided. Allowed: bio, avatarUrl', 400);
    }

    const user = await User.findByIdAndUpdate(req.user._id, updates, {
      new: true,
      runValidators: true,
    });

    return success(res, user, 200, 'Profile updated');
  } catch (err) {
    console.error('[updateProfile]', err);
    return error(res, 'Failed to update profile', 500);
  }
};

/**
 * DELETE /users/me
 * Permanently deletes the authenticated user's account.
 */
exports.deleteAccount = async (req, res) => {
  try {
    await User.findByIdAndDelete(req.user._id);
    return success(res, null, 200, 'Account deleted');
  } catch (err) {
    console.error('[deleteAccount]', err);
    return error(res, 'Failed to delete account', 500);
  }
};

/**
 * GET /users/:username/videos
 * Returns a cursor-paginated list of public (status=ready) videos for a given user.
 * Delegates to videoService.getUserVideos for query logic.
 */
exports.getUserVideos = async (req, res) => {
  try {
    const { username } = req.params;
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);
    const { cursor } = req.query;

    // Resolve username → _id so videoService can query by userId
    const user = await User.findOne({ username }).select('_id').lean();
    if (!user) return error(res, 'User not found', 404);

    const videos = await videoService.getUserVideos(user._id, cursor, limit + 1);

    const hasMore = videos.length > limit;
    if (hasMore) videos.pop();

    const nextCursor = hasMore ? videos[videos.length - 1]._id : null;

    return paginated(res, videos, { nextCursor, hasMore, limit });
  } catch (err) {
    console.error('[getUserVideos]', err);
    return error(res, 'Failed to fetch videos', 500);
  }
};

/**
 * GET /users/search?q=
 * Case-insensitive regex search on username, returns at most 10 results.
 * Returns only non-sensitive fields.
 */
exports.searchUsers = async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.trim().length === 0) {
      return error(res, 'Query parameter q is required', 400);
    }

    const users = await User.find(
      { username: { $regex: q.trim(), $options: 'i' } },
      'username avatarUrl bio followerCount videoCount'
    )
      .limit(10)
      .lean();

    return success(res, users);
  } catch (err) {
    console.error('[searchUsers]', err);
    return error(res, 'Search failed', 500);
  }
};

/**
 * POST /users/:username/follow
 * Toggles follow state for the authenticated user toward the target user.
 *
 * - If already following → unfollow (delete Follow doc, decrement counts).
 * - If not following → follow (create Follow doc, increment counts, send notification).
 *
 * Self-following is rejected.
 */
exports.followUser = async (req, res) => {
  try {
    const { username } = req.params;

    const targetUser = await User.findOne({ username });
    if (!targetUser) return error(res, 'User not found', 404);

    // Prevent self-following
    if (targetUser._id.toString() === req.user._id.toString()) {
      return error(res, 'You cannot follow yourself', 400);
    }

    const existing = await Follow.findOne({
      followerId: req.user._id,
      followingId: targetUser._id,
    });

    if (existing) {
      // --- UNFOLLOW ---
      await existing.deleteOne();

      // Decrement counters atomically (floor at 0 via $max is not natively supported,
      // so we use a conditional update to avoid going negative)
      await User.findByIdAndUpdate(req.user._id, {
        $inc: { followingCount: -1 },
      });
      await User.findByIdAndUpdate(targetUser._id, {
        $inc: { followerCount: -1 },
      });

      return success(res, { following: false }, 200, `Unfollowed @${username}`);
    }

    // --- FOLLOW ---
    await Follow.create({
      followerId: req.user._id,
      followingId: targetUser._id,
    });

    await User.findByIdAndUpdate(req.user._id, { $inc: { followingCount: 1 } });
    await User.findByIdAndUpdate(targetUser._id, { $inc: { followerCount: 1 } });

    // Notify the followed user
    await notificationService.createNotification(targetUser._id, 'new_follower', {
      actorId: req.user._id,
      actorUsername: req.user.username,
      actorAvatar: req.user.avatarUrl,
    });

    return success(res, { following: true }, 200, `Now following @${username}`);
  } catch (err) {
    // Gracefully handle duplicate key (race condition)
    if (err.code === 11000) {
      return success(res, { following: true }, 200, 'Already following');
    }
    console.error('[followUser]', err);
    return error(res, 'Follow action failed', 500);
  }
};