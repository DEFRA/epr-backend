import Joi from 'joi'

import { SUMMARY_LOG_STATUS } from '#domain/summary-logs/status.js'
import { loadsSchema } from '#domain/summary-logs/loads-schema.js'

const validationIssueSchema = Joi.object({
  type: Joi.string().valid('error', 'warning').optional(),
  code: Joi.string().required(),
  header: Joi.string().optional(),
  column: Joi.string().optional(),
  actual: Joi.any().optional(),
  expected: Joi.any().optional(),
  location: Joi.object({
    field: Joi.string().optional(),
    sheet: Joi.string().optional(),
    table: Joi.string().optional(),
    row: Joi.number().optional(),
    rowId: Joi.string().optional(),
    header: Joi.string().optional(),
    column: Joi.string().optional()
  }).optional()
})

const validationConcernsSchema = Joi.object().pattern(
  Joi.string(),
  Joi.object({
    sheet: Joi.string().required(),
    rows: Joi.array()
      .items(
        Joi.object({
          row: Joi.number().required(),
          issues: Joi.array().items(validationIssueSchema).required()
        })
      )
      .required()
  })
)

export const summaryLogResponseSchema = Joi.object({
  status: Joi.string()
    .valid(
      SUMMARY_LOG_STATUS.PREPROCESSING,
      SUMMARY_LOG_STATUS.REJECTED,
      SUMMARY_LOG_STATUS.VALIDATING,
      SUMMARY_LOG_STATUS.INVALID,
      SUMMARY_LOG_STATUS.VALIDATED,
      SUMMARY_LOG_STATUS.SUBMITTING,
      SUMMARY_LOG_STATUS.SUBMITTED
    )
    .required(),
  validation: Joi.object({
    failures: Joi.array().items(validationIssueSchema).required(),
    concerns: validationConcernsSchema.required()
  }).optional(),
  loads: loadsSchema.optional(),
  accreditationNumber: Joi.string().allow(null).optional()
})
