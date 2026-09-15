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
 * stored, with the number of returns owed for that month and not submitted,
 * one per accredited registration.
 */
export const outstandingReturnsResponseSchema = Joi.object({
  meta: Joi.object({
    generatedAt: Joi.string().isoDate().required()
  }).required(),
  data: Joi.object({
    months: monthsOf(outstandingByMaterialSchema)
  }).required()
})
