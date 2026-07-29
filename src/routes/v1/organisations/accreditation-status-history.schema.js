import Joi from 'joi'
import { ACCREDITATION_STATUS } from '#domain/organisations/model.js'
import { isoDateString } from '#common/validation/iso-date-schema.js'

/**
 * Discriminated union over the explicit from/to status pair: each supported
 * transition declares its own arm with the parameters it requires, so the
 * endpoint only accepts transitions that have been built. The handler still
 * checks the accreditation really is in fromStatus and that the transition
 * is in the domain map.
 */
const approvedToSuspendedSchema = Joi.object({
  fromStatus: Joi.string().valid(ACCREDITATION_STATUS.APPROVED).required(),
  toStatus: Joi.string().valid(ACCREDITATION_STATUS.SUSPENDED).required()
})

const suspendedToApprovedSchema = Joi.object({
  fromStatus: Joi.string().valid(ACCREDITATION_STATUS.SUSPENDED).required(),
  toStatus: Joi.string().valid(ACCREDITATION_STATUS.APPROVED).required()
})

// Cancellation is only reachable from suspended (PAE-1622): a direct
// approved -> cancelled arm is deliberately absent — suspend first (PAE-1624,
// ADR 0042). The registration-cancellation cascade is the sole exception.
const suspendedToCancelledSchema = Joi.object({
  fromStatus: Joi.string().valid(ACCREDITATION_STATUS.SUSPENDED).required(),
  toStatus: Joi.string().valid(ACCREDITATION_STATUS.CANCELLED).required()
})

// Reinstatement after a cancellation is overturned on appeal (PAE-1785),
// effective on the day it is actioned — not retrospective.
const cancelledToApprovedSchema = Joi.object({
  fromStatus: Joi.string().valid(ACCREDITATION_STATUS.CANCELLED).required(),
  toStatus: Joi.string().valid(ACCREDITATION_STATUS.APPROVED).required()
})

// Granting issues the accreditation number and sets validFrom to the supplied
// appliesFrom date. validTo is owned by the application data and is not
// changed by this transition.
const createdToApprovedSchema = Joi.object({
  fromStatus: Joi.string().valid(ACCREDITATION_STATUS.CREATED).required(),
  toStatus: Joi.string().valid(ACCREDITATION_STATUS.APPROVED).required(),
  appliesFrom: isoDateString().required(),
  accreditationNumber: Joi.string().trim().min(1).required()
})

// Refusing a non-compliant application (PAE-1618): the operator stays
// registered-only, so no number or validity dates are involved.
const createdToRejectedSchema = Joi.object({
  fromStatus: Joi.string().valid(ACCREDITATION_STATUS.CREATED).required(),
  toStatus: Joi.string().valid(ACCREDITATION_STATUS.REJECTED).required()
})

// Reopening a rejected application for rework (PAE-1623).
const rejectedToCreatedSchema = Joi.object({
  fromStatus: Joi.string().valid(ACCREDITATION_STATUS.REJECTED).required(),
  toStatus: Joi.string().valid(ACCREDITATION_STATUS.CREATED).required()
})

export const accreditationStatusHistoryPayloadSchema = Joi.alternatives()
  .try(
    approvedToSuspendedSchema,
    suspendedToApprovedSchema,
    suspendedToCancelledSchema,
    cancelledToApprovedSchema,
    createdToApprovedSchema,
    createdToRejectedSchema,
    rejectedToCreatedSchema
  )
  .required()
