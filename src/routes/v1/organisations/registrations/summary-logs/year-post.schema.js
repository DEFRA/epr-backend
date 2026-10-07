import Joi from 'joi'
import { yearSchema } from '#common/validation/year-schema.js'

export const summaryLogsYearCreateParamsSchema = Joi.object({
  organisationId: Joi.string().required(),
  registrationId: Joi.string().required(),
  year: yearSchema().required()
})

export const summaryLogsYearCreatePayloadSchema = Joi.object({
  redirectUrl: Joi.string().required()
}).messages({
  'any.required': '{#label} is required'
})
