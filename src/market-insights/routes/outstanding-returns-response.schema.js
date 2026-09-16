import Joi from 'joi'

import {
  TONNAGE_BAND,
  TONNAGE_MONITORING_MATERIALS
} from '#domain/organisations/model.js'
import { byReportingMonth, metaSchema, recordOf } from './response-schema.js'

const outstandingByMaterialSchema = recordOf(
  TONNAGE_MONITORING_MATERIALS,
  recordOf(Object.values(TONNAGE_BAND), Joi.number().integer().min(0))
)

/**
 * Response contract for the count of outstanding monthly returns. Keyed by
 * reporting month, then material, then the accreditation's tonnage band as
 * stored, with the number of returns owed for that month and not submitted,
 * one per accredited registration.
 */
export const outstandingReturnsResponseSchema = Joi.object({
  meta: metaSchema,
  data: Joi.object({
    months: byReportingMonth(
      Joi.object({ figures: outstandingByMaterialSchema.required() })
    )
  }).required()
})
