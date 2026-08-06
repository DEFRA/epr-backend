import Joi from 'joi'
import { REGISTRATION_STATUS } from '#domain/organisations/model.js'
import { isoDateString } from '#common/validation/iso-date-schema.js'

/**
 * Discriminated union over the explicit from/to status pair: each supported
 * transition declares its own arm with the parameters it requires, so the
 * endpoint only accepts transitions that have been built. The handler still
 * checks the registration really is in fromStatus and that the transition is
 * in the domain map.
 */

// Granting issues the registration number and sets validFrom to the supplied
// appliesFrom date. validTo is owned by the application data and is not
// changed by this transition.
const createdToApprovedSchema = Joi.object({
  fromStatus: Joi.string().valid(REGISTRATION_STATUS.CREATED).required(),
  toStatus: Joi.string().valid(REGISTRATION_STATUS.APPROVED).required(),
  appliesFrom: isoDateString().required(),
  registrationNumber: Joi.string().trim().min(1).required()
})

// Refusing a non-compliant application (PAE-1609): the operator is not
// registered for the site/material — no number or validity dates involved.
const createdToRejectedSchema = Joi.object({
  fromStatus: Joi.string().valid(REGISTRATION_STATUS.CREATED).required(),
  toStatus: Joi.string().valid(REGISTRATION_STATUS.REJECTED).required()
})

// Reopening a rejected application for rework (PAE-1614).
const rejectedToCreatedSchema = Joi.object({
  fromStatus: Joi.string().valid(REGISTRATION_STATUS.REJECTED).required(),
  toStatus: Joi.string().valid(REGISTRATION_STATUS.CREATED).required()
})

// Registrations cancel directly from approved (PAE-1615): there is no
// suspended state (PAE-1705). The repository cascade force-cancels the
// linked live accreditation in the same replace.
const approvedToCancelledSchema = Joi.object({
  fromStatus: Joi.string().valid(REGISTRATION_STATUS.APPROVED).required(),
  toStatus: Joi.string().valid(REGISTRATION_STATUS.CANCELLED).required()
})

// Reinstatement after a cancellation is overturned on appeal (PAE-1616),
// effective on the day it is actioned — not retrospective. The
// cascade-cancelled accreditation is NOT auto-reinstated.
const cancelledToApprovedSchema = Joi.object({
  fromStatus: Joi.string().valid(REGISTRATION_STATUS.CANCELLED).required(),
  toStatus: Joi.string().valid(REGISTRATION_STATUS.APPROVED).required()
})

export const registrationStatusHistoryPayloadSchema = Joi.alternatives()
  .try(
    createdToApprovedSchema,
    createdToRejectedSchema,
    rejectedToCreatedSchema,
    approvedToCancelledSchema,
    cancelledToApprovedSchema
  )
  .required()
