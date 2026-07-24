import Joi from 'joi'
import { REG_ACC_STATUS } from '#domain/organisations/model.js'

/**
 * Discriminated union on `status`: each target status declares its own arm
 * with the parameters that transition requires. Only suspension is supported
 * so far; add an arm per status as transitions gain endpoints.
 */
const suspendedSchema = Joi.object({
  status: Joi.string().valid(REG_ACC_STATUS.SUSPENDED).required()
})

export const accreditationStatusHistoryPayloadSchema = Joi.alternatives()
  .try(suspendedSchema)
  .required()
