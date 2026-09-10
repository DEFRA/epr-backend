import Joi from 'joi'

const wasteBalanceSchema = Joi.object({
  amount: Joi.number().required(),
  availableAmount: Joi.number().required(),
  // Present only when the accreditation holds a separate December portion.
  decemberAmount: Joi.number(),
  decemberAvailableAmount: Joi.number()
})

export const wasteBalanceResponseSchema = Joi.object().pattern(
  Joi.string().pattern(/^[a-f0-9]{24}$/),
  wasteBalanceSchema
)
