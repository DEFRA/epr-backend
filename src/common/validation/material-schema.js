import Joi from 'joi'

import {
  MATERIAL,
  TONNAGE_MONITORING_MATERIALS
} from '#domain/organisations/model.js'

/**
 * What the record is for, once resolved. Glass is the only material that
 * sub-divides, so this reads `glass_re_melt` or `glass_other` where the store
 * holds `glass` beside a single recycling process. Plain `glass` is never a
 * resolved material: a record that carries no process, or more than one, has
 * not been split, and the key is left out rather than carrying a value the
 * record has not earned.
 */
export const materialSchema = Joi.string().valid(
  ...TONNAGE_MONITORING_MATERIALS
)

/**
 * The material as the applicant declared it on the form, which is one of the
 * seven the form offers and so includes plain `glass`.
 */
export const appliedForMaterialSchema = Joi.string().valid(
  ...Object.values(MATERIAL)
)
