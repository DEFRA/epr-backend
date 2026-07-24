import Joi from 'joi'
import { REG_ACC_STATUS } from '#domain/organisations/model.js'

const dateSchema = Joi.string()
  .pattern(/^\d{4}-\d{2}-\d{2}$/)
  .custom((value, helpers) => {
    const date = new Date(`${value}T00:00:00.000Z`)
    if (Number.isNaN(date.getTime())) {
      return helpers.error('string.pattern.base')
    }
    return value
  })
  .messages({ 'string.pattern.base': 'Date must be in YYYY-MM-DD format' })

/**
 * Discriminated union over the explicit from/to status pair: each supported
 * transition declares its own arm with the parameters it requires, so the
 * endpoint only accepts transitions that have been built. The handler still
 * checks the accreditation really is in fromStatus and that the transition
 * is in the domain map.
 */
const approvedToSuspendedSchema = Joi.object({
  fromStatus: Joi.string().valid(REG_ACC_STATUS.APPROVED).required(),
  toStatus: Joi.string().valid(REG_ACC_STATUS.SUSPENDED).required()
})

const suspendedToApprovedSchema = Joi.object({
  fromStatus: Joi.string().valid(REG_ACC_STATUS.SUSPENDED).required(),
  toStatus: Joi.string().valid(REG_ACC_STATUS.APPROVED).required()
})

// Granting issues the accreditation number and sets validFrom to the supplied
// appliesFrom date. validTo is owned by the application data and is not
// changed by this transition.
const createdToApprovedSchema = Joi.object({
  fromStatus: Joi.string().valid(REG_ACC_STATUS.CREATED).required(),
  toStatus: Joi.string().valid(REG_ACC_STATUS.APPROVED).required(),
  appliesFrom: dateSchema.required(),
  accreditationNumber: Joi.string().trim().min(1).required()
})

export const accreditationStatusHistoryPayloadSchema = Joi.alternatives()
  .try(
    approvedToSuspendedSchema,
    suspendedToApprovedSchema,
    createdToApprovedSchema
  )
  .required()
