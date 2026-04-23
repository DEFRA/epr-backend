import Joi from 'joi'

export const dlqMessagesResponseSchema = Joi.object({
  approximateMessageCount: Joi.number().integer().min(0).required(),
  messages: Joi.array()
    .items(
      Joi.object({
        messageId: Joi.string().required(),
        sentTimestamp: Joi.string().isoDate().allow(null).required(),
        approximateReceiveCount: Joi.number().integer().min(0).required(),
        command: Joi.object().allow(null).required(),
        body: Joi.string().required()
      })
    )
    .required()
})

export const dlqPurgeResponseSchema = Joi.object({
  purged: Joi.boolean().valid(true).required()
})
