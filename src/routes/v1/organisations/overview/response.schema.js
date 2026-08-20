import Joi from 'joi'
import { registrationSummarySchema } from '#application/organisations/registration-summary.js'

const accreditationSchema = Joi.object({
  id: Joi.string().required(),
  accreditationNumber: Joi.string().allow(null).required(),
  status: Joi.string().required()
})

const registrationSchema = registrationSummarySchema.keys({
  accreditation: accreditationSchema.optional()
})

const linkedDefraOrganisationSchema = Joi.object({
  orgId: Joi.string().required(),
  orgName: Joi.string().required(),
  linkedAt: Joi.date().required(),
  linkedBy: Joi.object({
    email: Joi.string().required()
  }).required()
})

export const organisationsOverviewResponseSchema = Joi.object({
  id: Joi.string().required(),
  companyName: Joi.string().required(),
  registrations: Joi.array().items(registrationSchema).required(),
  linkedDefraOrganisation: linkedDefraOrganisationSchema.optional()
})
