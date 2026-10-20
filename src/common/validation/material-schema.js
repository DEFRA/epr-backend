import Joi from 'joi'

import { TONNAGE_MONITORING_MATERIALS } from '#domain/organisations/model.js'

/**
 * What the record is for, once resolved. Glass is the only material that
 * sub-divides, so this reads `glass_re_melt` or `glass_other` where the store
 * holds `glass` beside a single recycling process. Plain `glass` is never a
 * resolved material.
 */
export const materialSchema = Joi.string().valid(
  ...TONNAGE_MONITORING_MATERIALS
)
