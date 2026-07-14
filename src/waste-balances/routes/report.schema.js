import Joi from 'joi'

const totalSchema = Joi.object({
  material: Joi.string().required(),
  wasteProcessingType: Joi.string().required(),
  amount: Joi.number().required(),
  availableAmount: Joi.number().required()
})

const accreditationSchema = totalSchema.keys({
  orgId: Joi.string().required(),
  registrationNumber: Joi.string().required(),
  accreditationNumber: Joi.string().required()
})

export const wasteBalanceReportResponseSchema = Joi.object({
  cutoff: Joi.string().isoDate().required(),
  totals: Joi.array().items(totalSchema).required(),
  accreditations: Joi.array().items(accreditationSchema).required()
})
