const Joi = require('joi');

exports.registerSchema = Joi.object({
  username: Joi.string()
    .pattern(/^[a-zA-Z0-9_]+$/)
    .min(3)
    .max(30)
    .required()
    .messages({ 'string.pattern.base': 'Username chỉ được chứa chữ, số và dấu gạch dưới' }),
  email: Joi.string().email().required(),
  password: Joi.string().min(6).max(128).required(),
});

exports.loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
});

exports.refreshSchema = Joi.object({
  refreshToken: Joi.string().required(),
});

exports.updateProfileSchema = Joi.object({
  username: Joi.string().pattern(/^[a-zA-Z0-9_]+$/).min(3).max(30),
  bio: Joi.string().max(150).allow(''),
  avatarUrl: Joi.string().uri().max(1000).allow(null, ''),
}).min(1);
