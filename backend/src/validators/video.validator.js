const Joi = require('joi');
const { SUPPORTED_LANGS } = require('../utils/constants');

const langCodes = SUPPORTED_LANGS.map((l) => l.code);
const hashtags = Joi.array().items(Joi.string().max(50)).max(20);

exports.createVideoSchema = Joi.object({
  title: Joi.string().trim().max(200).required(),
  description: Joi.string().trim().max(2000).allow('').default(''),
  hashtags,
  originalKey: Joi.string().max(300),
  originalUrl: Joi.string().uri().max(1000),
  originalLang: Joi.string().valid(...langCodes),
  isPrivate: Joi.boolean(),
  allowComment: Joi.boolean(),
  allowDuet: Joi.boolean(),
  duetOfVideoId: Joi.string().hex().length(24),
});

exports.updateVideoSchema = Joi.object({
  title: Joi.string().trim().max(200),
  description: Joi.string().trim().max(2000).allow(''),
  hashtags,
  originalLang: Joi.string().valid(...langCodes),
  isPrivate: Joi.boolean(),
  allowComment: Joi.boolean(),
  allowDuet: Joi.boolean(),
}).min(1);

exports.requestDubbingSchema = Joi.object({
  videoId: Joi.string().hex().length(24).required(),
  targetLang: Joi.string()
    .valid(...langCodes)
    .required(),
  sourceLang: Joi.string().valid(...langCodes),
  force: Joi.boolean().default(false),
});

exports.createCommentSchema = Joi.object({
  videoId: Joi.string().hex().length(24).required(),
  content: Joi.string().trim().min(1).max(500).required(),
  parentId: Joi.string().hex().length(24).allow(null),
});
