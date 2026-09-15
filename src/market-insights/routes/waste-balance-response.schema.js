import Joi from 'joi'

import {
  TONNAGE_MONITORING_MATERIALS,
  WASTE_PROCESSING_TYPE
} from '#domain/organisations/model.js'
import { monthsOf, requiredRecordOf } from './publication.schema.js'

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

const figuresByMaterialSchema = requiredRecordOf(
  TONNAGE_MONITORING_MATERIALS,
  requiredRecordOf(Object.values(WASTE_PROCESSING_TYPE), publishedFiguresSchema)
)

/**
 * Response contract for the published UK Waste Balance table. Keyed by
 * reporting month, then material, then accreditation type, with the net credit
 * the publication prints alongside the figures it is derived from. Each month
 * says how many monthly reports it was owed and how many have been submitted,
 * and the period carries the sum.
 */
export const wasteBalanceResponseSchema = Joi.object({
  meta: Joi.object({
    generatedAt: Joi.string().isoDate().required()
  }).required(),
  data: Joi.object({
    months: monthsOf(
      Joi.object({
        reports: reportCountSchema.required(),
        figures: figuresByMaterialSchema.required()
      })
    ),
    period: Joi.object({ reports: reportCountSchema.required() }).required()
  }).required()
})
