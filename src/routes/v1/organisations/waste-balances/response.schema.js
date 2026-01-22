import Joi from 'joi'

const wasteBalanceSchema = Joi.object({
  amount: Joi.number().required(),
  availableAmount: Joi.number().required()
})

export const wasteBalanceResponseSchema = Joi.object().pattern(
  Joi.string().pattern(/^[a-f0-9]{24}$/),
  wasteBalanceSchema
)
