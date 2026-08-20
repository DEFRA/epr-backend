import Joi from 'joi'
import {
  registrationSummarySchema,
  siteLocationSchema
} from '#application/organisations/registration-summary.js'

const accreditedPeriodSchema = Joi.object({
  id: Joi.string().required(),
  accreditationNumber: Joi.string().required(),
  status: Joi.string().required(),
  validFrom: Joi.string().allow(null).required(),
  validTo: Joi.string().allow(null).required()
})

const registrationWithSiteLocationSchema =
  registrationSummarySchema.concat(siteLocationSchema)

export const registrationDetailsResponseSchema = Joi.object({
  organisationId: Joi.string().required(),
  companyName: Joi.string().required(),
  registration: registrationWithSiteLocationSchema.required(),
  accreditations: Joi.array().items(accreditedPeriodSchema).required()
})
