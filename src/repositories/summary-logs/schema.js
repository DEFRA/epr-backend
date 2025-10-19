import Joi from 'joi'

import { SUMMARY_LOG_STATUS } from '#domain/summary-log.js'

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
  SUMMARY_LOG_STATUS.VALIDATED
)

const fileSchema = Joi.object({
  id: Joi.string().required(),
  name: Joi.string().required(),
  status: Joi.string().valid('complete', 'pending', 'rejected').optional(),
  s3: Joi.object({
    bucket: Joi.string().required(),
    key: Joi.string().required()
  }).when('status', {
    is: 'complete',
    then: Joi.required(),
    otherwise: Joi.optional()
  })
})

export const summaryLogInsertSchema = Joi.object({
  id: idSchema,
  status: statusSchema.required(),
  failureReason: Joi.string().optional(),
  file: fileSchema.required(),
  organisationId: Joi.string().optional(),
  registrationId: Joi.string().optional()
}).messages(commonMessages)

export const summaryLogUpdateSchema = Joi.object({
  status: statusSchema.optional(),
  failureReason: Joi.string().optional(),
  file: fileSchema.optional(),
  organisationId: Joi.string().optional(),
  registrationId: Joi.string().optional()
})
  .min(1)
  .messages({
    ...commonMessages,
    'object.min': 'updates must contain at least one field'
  })
