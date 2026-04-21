import Joi from 'joi'

const accreditationSchema = Joi.object({
  id: Joi.string().required(),
  accreditationNumber: Joi.string().allow(null).required(),
  status: Joi.string().required()
})

const registrationSchema = Joi.object({
  id: Joi.string().required(),
  registrationNumber: Joi.string().allow(null).required(),
  status: Joi.string().required(),
  material: Joi.string().required(),
  processingType: Joi.string().required(),
  site: Joi.string().allow(null).required(),
  accreditation: accreditationSchema.optional()
})

export const organisationsOverviewResponseSchema = Joi.object({
  id: Joi.string().required(),
  companyName: Joi.string().required(),
  registrations: Joi.array().items(registrationSchema).required()
})
