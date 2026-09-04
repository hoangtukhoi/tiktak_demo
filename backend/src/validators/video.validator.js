const Joi = require('joi');
exports.createVideoSchema = Joi.object({
  title: Joi.string().max(200).required(),
  description: Joi.string().max(2000).optional(),
  hashtags: Joi.array().items(Joi.string()).optional(),
  isPrivate: Joi.boolean().optional(),
  allowComment: Joi.boolean().optional(),
  allowDuet: Joi.boolean().optional(),
});
exports.updateVideoSchema = Joi.object({
  title: Joi.string().max(200).optional(),
  description: Joi.string().max(2000).optional(),
  hashtags: Joi.array().items(Joi.string()).optional(),
  isPrivate: Joi.boolean().optional(),
  allowComment: Joi.boolean().optional(),
  allowDuet: Joi.boolean().optional(),
});