const Joi = require('joi');
exports.createVideoSchema = Joi.object({
  title: Joi.string().max(200).required(),
  description: Joi.string().max(2000).optional(),
  hashtags: Joi.array().items(Joi.string()).optional(),
  isPrivate: Joi.boolean().optional(),
  visibility: Joi.string().valid('public', 'friends', 'private').optional(),
  allowComment: Joi.boolean().optional(),
  allowDuet: Joi.boolean().optional(),
  isDraft: Joi.boolean().optional(),
  scheduledAt: Joi.date().allow(null, '').optional(),
  mentions: Joi.array().items(Joi.string()).max(10).optional(),
  sourceLang: Joi.string().max(10).optional(),
  autoCaption: Joi.boolean().optional(),
  dubLangs: Joi.array().items(Joi.string().max(10)).max(10).optional(),
});
exports.updateVideoSchema = Joi.object({
  title: Joi.string().max(200).optional(),
  description: Joi.string().max(2000).optional(),
  hashtags: Joi.array().items(Joi.string()).optional(),
  isPrivate: Joi.boolean().optional(),
  visibility: Joi.string().valid('public', 'friends', 'private').optional(),
  allowComment: Joi.boolean().optional(),
  allowDuet: Joi.boolean().optional(),
  isDraft: Joi.boolean().optional(),
  scheduledAt: Joi.date().allow(null, '').optional(),
});