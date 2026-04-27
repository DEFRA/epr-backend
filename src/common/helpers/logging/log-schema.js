import Joi from 'joi'

export const logSchema = Joi.object({
  message: Joi.string(),
  error: Joi.object({
    code: Joi.string(),
    message: Joi.string()
  }).unknown(false),
  event: Joi.object({
    category: Joi.string(),
    action: Joi.string()
  }).unknown(false),
  http: Joi.object({
    response: Joi.object({
      status_code: Joi.number().integer()
    }).unknown(false)
  }).unknown(false)
}).unknown(false)
