import Joi from 'joi'

import { materialSchema } from '#common/validation/material-schema.js'

const REPORTING_MONTH = /^\d{4}-\d{2}$/
const reportingMonthSchema = Joi.string().pattern(REPORTING_MONTH).required()

const reportCountSchema = Joi.object({
  expected: Joi.number().integer().min(0).required(),
  submitted: Joi.number().integer().min(0).required()
})

/**
 * Response contract for the published UK Waste Balance table. One row per
 * material, accreditation type and reporting month, with the net credit the
 * publication prints alongside the figures it is derived from. The monthly
 * report counts say how many reports the figures were owed and how many of
 * them have been submitted, once per month served and once for the period.
 */
export const wasteBalanceResponseSchema = Joi.object({
  meta: Joi.object({
    generatedAt: Joi.string().isoDate().required(),
    monthlyReports: Joi.object({
      byMonth: Joi.object()
        .pattern(REPORTING_MONTH, reportCountSchema.required())
        .required(),
      total: reportCountSchema.required()
    }).required()
  }).required(),
  data: Joi.array()
    .items(
      Joi.object({
        material: materialSchema.required(),
        accreditationType: Joi.string()
          .valid('reprocessor', 'exporter')
          .required(),
        month: reportingMonthSchema,
        totalCredited: Joi.number().required(),
        eligibleForWasteBalance: Joi.number().required(),
        sentOnDeductions: Joi.number().required(),
        netCredit: Joi.number().required()
      })
    )
    .required()
})
