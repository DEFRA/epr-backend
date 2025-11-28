import Joi from 'joi'

import { SUMMARY_LOG_STATUS } from '#domain/summary-logs/status.js'
import { loadsSchema } from '#domain/summary-logs/loads-schema.js'

const commonMessages = {
  'any.required': '{#label} is required',
  'string.empty': '{#label} cannot be empty',
  'any.only': '{#label} must be one of {#valids}'
}

export const idSchema = Joi.string().required().messages({
  'any.required': 'id is required',
  'string.empty': 'id cannot be empty',
  'string.base': 'id must be a string'
})

const statusSchema = Joi.string().valid(
  SUMMARY_LOG_STATUS.PREPROCESSING,
  SUMMARY_LOG_STATUS.VALIDATING,
  SUMMARY_LOG_STATUS.REJECTED,
  SUMMARY_LOG_STATUS.INVALID,
  SUMMARY_LOG_STATUS.VALIDATED,
  SUMMARY_LOG_STATUS.SUBMITTING,
  SUMMARY_LOG_STATUS.SUBMITTED
)

const fileSchema = Joi.object({
  id: Joi.string().required(),
  name: Joi.string().required(),
  status: Joi.string().valid('pending', 'rejected', 'complete').optional(),
  uri: Joi.when('status', {
    is: 'complete',
    then: Joi.string().required()
  })
})

export const summaryLogInsertSchema = Joi.object({
  status: statusSchema.required(),
  failureReason: Joi.string().optional(),
  validation: Joi.object({
    issues: Joi.array().items(Joi.object()).optional()
  }).optional(),
  file: fileSchema.required(),
  organisationId: Joi.string().optional(),
  registrationId: Joi.string().optional()
}).messages(commonMessages)

export const summaryLogUpdateSchema = Joi.object({
  status: statusSchema.optional(),
  failureReason: Joi.string().optional(),
  validation: Joi.object({
    issues: Joi.array().items(Joi.object()).optional()
  }).optional(),
  loads: loadsSchema.optional(),
  file: fileSchema.optional(),
  organisationId: Joi.string().optional(),
  registrationId: Joi.string().optional()
})
  .min(1)
  .messages({
    ...commonMessages,
    'object.min': 'updates must contain at least one field'
  })
