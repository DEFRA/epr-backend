import Joi from 'joi'
import { REG_ACC_STATUS } from '#domain/organisations/model.js'

/**
 * Discriminated union over the parameters each transition requires.
 * Suspension and reinstatement are supported so far; add an arm per
 * transition as they gain endpoints. Arms are named by transition, not by
 * target status: created -> approved (grant) will be a separate arm from
 * suspended -> approved (reinstate) because granting requires the
 * accreditation number, which is set on first approval.
 */
const suspendedSchema = Joi.object({
  status: Joi.string().valid(REG_ACC_STATUS.SUSPENDED).required()
})

const suspendedToApprovedSchema = Joi.object({
  status: Joi.string().valid(REG_ACC_STATUS.APPROVED).required()
})

export const accreditationStatusHistoryPayloadSchema = Joi.alternatives()
  .try(suspendedSchema, suspendedToApprovedSchema)
  .required()
