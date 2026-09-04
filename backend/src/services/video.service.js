const Video = require('../models/Video');
exports.createVideo = async (userId, data) => {
  return Video.create({ userId, ...data, status: 'uploading' });
};
exports.getVideoById = async (id, currentUserId) => {
  const video = await Video.findById(id).populate('userId', 'username avatarUrl');
  if (!video) throw Object.assign(new Error('Not found'), { statusCode: 404 });
  return video;
};
exports.updateVideo = async (id, userId, data) => {
  const video = await Video.findOneAndUpdate({ _id: id, userId }, data, { new: true });
  if (!video) throw Object.assign(new Error('Not found or unauthorized'), { statusCode: 404 });
  return video;
};
exports.deleteVideo = async (id, userId) => {
  return Video.findOneAndUpdate({ _id: id, userId }, { status: 'failed' });
};
exports.getUserVideos = async (userId, cursor, limit = 10) => {
  const query = { userId, status: 'ready' };
  if (cursor) query._id = { $lt: cursor };
  return Video.find(query).sort({ _id: -1 }).limit(limit).populate('userId', 'username avatarUrl');
};
exports.updateVideoUrls = async (id, data) => {
  return Video.findByIdAndUpdate(id, data, { new: true });
};
exports.searchVideos = async (q, page = 1, limit = 10) => {
  const skip = (page - 1) * limit;
  return Video.find({ title: new RegExp(q, 'i'), status: 'ready' }).skip(skip).limit(limit).populate('userId', 'username avatarUrl');
};
exports.getTrendingVideos = async (limit = 10) => {
  return Video.aggregate([
    { $match: { status: 'ready' } },
    { $addFields: { score: { $add: ['$likeCount', { $multiply: ['$viewCount', 0.1] }] } } },
    { $sort: { score: -1 } },
    { $limit: limit }
  ]);
};