import Joi from 'joi'

export const dlqStatusResponseSchema = Joi.object({
  approximateMessageCount: Joi.number().integer().min(0).required()
})

export const dlqPurgeResponseSchema = Joi.object({
  purged: Joi.boolean().valid(true).required()
})
