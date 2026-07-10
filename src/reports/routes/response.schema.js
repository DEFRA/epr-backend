import Joi from 'joi'

import { tonnage } from '#common/validation/tonnage-schema.js'
import { CADENCE } from '#reports/domain/cadence.js'
import { PERIOD_STATUS } from '#reports/domain/period-status.js'
import { REPORT_STATUS } from '#reports/domain/report-status.js'
import {
  cadenceSchema,
  periodSchema,
  prnSchema
} from '#reports/repository/schema.js'

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

/**
 * Response contract for the report-detail GET/POST, shared by every reports page
 * in the frontend. Validates the sections the frontend consumes - notably `prn`,
 * whose `issuedTonnage`/`freeTonnage` are whole numbers via the shared tonnage
 * schema - and tolerates backend-internal fields (id, status, diagnostics,
 * version, stale, ...) that vary between stored and computed reports.
 */
export const reportDetailResponseSchema = Joi.object({
  cadence: cadenceSchema.optional(),
  details: Joi.object({
    material: Joi.string().required(),
    site: Joi.object().unknown(true).allow(null).optional()
  }).required(),
  dueDate: Joi.string().isoDate().optional(),
  endDate: Joi.string().isoDate().optional(),
  exportActivity: Joi.object({
    overseasSites: Joi.array().required(),
    totalTonnageExported: tonnage().required(),
    unapprovedOverseasSites: Joi.array().required()
  })
    .unknown(true)
    .optional(),
  operatorCategory: Joi.string().optional(),
  period: periodSchema.optional(),
  prn: prnSchema.allow(null),
  recyclingActivity: Joi.object({
    suppliers: Joi.array().required(),
    totalTonnageReceived: tonnage().required()
  })
    .unknown(true)
    .required(),
  source: Joi.object({
    lastUploadedAt: Joi.string().isoDate().allow(null),
    summaryLogId: Joi.string().allow(null)
  })
    .unknown(true)
    .required(),
  startDate: Joi.string().isoDate().optional(),
  wasteSent: Joi.object({
    finalDestinations: Joi.array().required(),
    tonnageSentToAnotherSite: tonnage().required(),
    tonnageSentToExporter: tonnage().required(),
    tonnageSentToReprocessor: tonnage().required()
  })
    .unknown(true)
    .required(),
  year: Joi.number().optional()
}).unknown(true)
