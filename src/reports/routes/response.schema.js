import Joi from 'joi'

import { CADENCE } from '#reports/domain/cadence.js'
import { PERIOD_STATUS } from '#reports/domain/period-status.js'
import { REPORT_STATUS } from '#reports/domain/report-status.js'

const userSummarySchema = Joi.object({
  id: Joi.string().required(),
  name: Joi.string(),
  email: Joi.string(),
  position: Joi.string()
}).unknown(true)

const reportListItemSchema = Joi.object({
  id: Joi.string().required(),
  status: Joi.string()
    .valid(...Object.values(REPORT_STATUS))
    .required(),
  submissionNumber: Joi.number().integer().required(),
  submittedAt: Joi.string().allow(null).required(),
  submittedBy: userSummarySchema.allow(null).required()
})

const reportingPeriodSchema = Joi.object({
  year: Joi.number().integer().required(),
  period: Joi.number().integer().required(),
  startDate: Joi.string().required(),
  endDate: Joi.string().required(),
  dueDate: Joi.string().required(),
  submissionNumber: Joi.number().integer().required(),
  periodStatus: Joi.string()
    .valid(...Object.values(PERIOD_STATUS))
    .required(),
  report: reportListItemSchema.allow(null).required()
})

export const reportsCalendarResponseSchema = Joi.object({
  cadence: Joi.string()
    .valid(...Object.values(CADENCE))
    .required(),
  reportingPeriods: Joi.array().items(reportingPeriodSchema).required()
})
