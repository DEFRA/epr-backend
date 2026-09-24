import Joi from 'joi'

import {
  TONNAGE_MONITORING_MATERIALS,
  WASTE_PROCESSING_TYPE
} from '#domain/organisations/model.js'
import {
  byReportingMonth,
  metaSchema,
  operatorCountKeys,
  recordOf,
  reportCountSchema
} from './response-schema.js'

const publishedFiguresSchema = Joi.object({
  totalCredited: Joi.number().required(),
  eligibleForWasteBalance: Joi.number().required(),
  sentOnDeductions: Joi.number().required(),
  netCredit: Joi.number().required(),
  ...operatorCountKeys
})

const figuresByMaterialSchema = recordOf(
  TONNAGE_MONITORING_MATERIALS,
  recordOf(Object.values(WASTE_PROCESSING_TYPE), publishedFiguresSchema)
)

const operatorCountsByMaterialSchema = recordOf(
  TONNAGE_MONITORING_MATERIALS,
  recordOf(Object.values(WASTE_PROCESSING_TYPE), Joi.object(operatorCountKeys))
)

/**
 * Response contract for the published UK Waste Balance table. Keyed by
 * reporting month, then material, then accreditation type, with the net credit
 * the publication prints alongside the figures it is derived from. Each month
 * says how many monthly reports it was owed and how many have been submitted,
 * and the period carries the sum. That count covers every accredited
 * registration on the register, whatever status its accreditation holds now,
 * matching the loads this table keeps.
 *
 * Every figure also carries two operator counts, for the regulators to judge
 * whether it would identify an operator. An operator is a business, and
 * counts once however many sites it has, so one with sites in two nations
 * counts once.
 *
 * - `operatorCount` is the operators who could have contributed: every
 *   operator owed a monthly report for the month, whether or not the net
 *   credit includes any of its tonnage, and every operator whose tonnage it
 *   includes. A suspended operator counts. One whose accreditation stood
 *   cancelled for the whole month does not, unless it sent tonnage on that
 *   month, and neither does one the figures leave out.
 * - `submittingOperatorCount` is the operators whose tonnage the net credit
 *   includes: an eligible load that credits it, or a sent-on load deducted
 *   from it. A load the waste balance ignores, such as one dated while the
 *   accreditation was suspended, adds to the gross credited tonnage only, so
 *   its operator does not count.
 *
 * The period carries the same two counts for each material and accreditation
 * type's total across the months served. An operator counts once there,
 * however many of those months it contributes to, so a period count is not
 * the sum of the monthly ones.
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
    period: Joi.object({
      reports: reportCountSchema.required(),
      operatorCounts: operatorCountsByMaterialSchema.required()
    }).required()
  }).required()
})
