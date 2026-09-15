import Joi from 'joi'

import {
  TONNAGE_MONITORING_MATERIALS,
  WASTE_PROCESSING_TYPE
} from '#domain/organisations/model.js'
import { byReportingMonth, metaSchema, recordOf } from './response-schema.js'

const reportCountSchema = Joi.object({
  expected: Joi.number().integer().min(0).required(),
  submitted: Joi.number().integer().min(0).required()
})

const publishedFiguresSchema = Joi.object({
  totalCredited: Joi.number().required(),
  eligibleForWasteBalance: Joi.number().required(),
  sentOnDeductions: Joi.number().required(),
  netCredit: Joi.number().required()
})

const figuresByMaterialSchema = recordOf(
  TONNAGE_MONITORING_MATERIALS,
  recordOf(Object.values(WASTE_PROCESSING_TYPE), publishedFiguresSchema)
)

/**
 * Response contract for the published UK Waste Balance table. Keyed by
 * reporting month, then material, then accreditation type, with the net credit
 * the publication prints alongside the figures it is derived from. Each month
 * says how many monthly reports it was owed and how many have been submitted,
 * and the period carries the sum.
 */
export const wasteBalanceResponseSchema = Joi.object({
  meta: metaSchema,
  data: Joi.object({
    months: byReportingMonth(
      Joi.object({
        reports: reportCountSchema.required(),
        figures: figuresByMaterialSchema.required()
      })
    ),
    period: Joi.object({ reports: reportCountSchema.required() }).required()
  }).required()
})
