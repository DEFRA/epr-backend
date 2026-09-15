import Joi from 'joi'

import { materialSchema } from '#common/validation/material-schema.js'

/**
 * Response contract for the published UK Waste Balance table. One row per
 * material, accreditation type and reporting month, with the net credit the
 * publication prints alongside the figures it is derived from. The monthly
 * report counts, once for the period, say how many reports the figures were
 * owed across the months served and how many of them have been submitted.
 */
export const wasteBalanceResponseSchema = Joi.object({
  meta: Joi.object({
    generatedAt: Joi.string().isoDate().required(),
    monthlyReports: Joi.object({
      expected: Joi.number().integer().min(0).required(),
      submitted: Joi.number().integer().min(0).required()
    }).required()
  }).required(),
  data: Joi.array()
    .items(
      Joi.object({
        material: materialSchema.required(),
        accreditationType: Joi.string()
          .valid('reprocessor', 'exporter')
          .required(),
        month: Joi.string()
          .pattern(/^\d{4}-\d{2}$/)
          .required(),
        totalCredited: Joi.number().required(),
        eligibleForWasteBalance: Joi.number().required(),
        sentOnDeductions: Joi.number().required(),
        netCredit: Joi.number().required()
      })
    )
    .required()
})
