import Joi from 'joi'

import {
  TONNAGE_BAND,
  TONNAGE_MONITORING_MATERIALS
} from '#domain/organisations/model.js'
import { monthsOf, requiredRecordOf } from './publication.schema.js'

const outstandingByMaterialSchema = requiredRecordOf(
  TONNAGE_MONITORING_MATERIALS,
  requiredRecordOf(Object.values(TONNAGE_BAND), Joi.number().integer().min(0))
)

/**
 * Response contract for the count of outstanding monthly returns. Keyed by
 * reporting month, then material, then the accreditation's tonnage band as
 * stored, with the count of accredited operators that owed a report for that
 * month and have not submitted one.
 */
export const outstandingReturnsResponseSchema = Joi.object({
  meta: Joi.object({
    generatedAt: Joi.string().isoDate().required()
  }).required(),
  data: Joi.object({
    months: monthsOf(outstandingByMaterialSchema)
  }).required()
})
