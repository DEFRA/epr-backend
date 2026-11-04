import Joi from 'joi'

export const wasteBalanceSchema = Joi.object({
  amount: Joi.number().required(),
  availableAmount: Joi.number().required(),
  // Present only when the accreditation holds a separate December portion.
  decemberAmount: Joi.number(),
  decemberAvailableAmount: Joi.number(),
  // Present only when the accreditation holds a separate December portion.
  nonDecemberAvailableAmount: Joi.number()
})
