import Joi from 'joi'
import {
  SUMMARY_LOG_STATUS,
  SUMMARY_LOG_FAILURE_STATUS
} from '#domain/summary-logs/status.js'

const summaryLogRowSchema = Joi.object({
  summaryLogId: Joi.string().required(),
  filename: Joi.string().required(),
  uploadedAt: Joi.string().isoDate().required(),
  status: Joi.string()
    .valid(SUMMARY_LOG_STATUS.SUBMITTED, ...SUMMARY_LOG_FAILURE_STATUS)
    .required()
})

export const summaryLogsListResponseSchema = Joi.object({
  summaryLogs: Joi.array().items(summaryLogRowSchema).required()
}).required()
