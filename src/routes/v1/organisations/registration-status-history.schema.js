import Joi from 'joi'
import { REGISTRATION_STATUS } from '#domain/organisations/model.js'
import { isoDateString } from '#common/validation/iso-date-schema.js'

// Granting issues the registration number and sets validFrom to the supplied
// appliesFrom date. validTo is owned by the application data and is not
// changed by this transition. Only the grant transition is supported so far
// (PAE-1599); further registration transitions add further arms here,
// mirroring accreditation-status-history.schema.js.
const createdToApprovedSchema = Joi.object({
  fromStatus: Joi.string().valid(REGISTRATION_STATUS.CREATED).required(),
  toStatus: Joi.string().valid(REGISTRATION_STATUS.APPROVED).required(),
  appliesFrom: isoDateString().required(),
  registrationNumber: Joi.string().trim().min(1).required()
})

export const registrationStatusHistoryPayloadSchema = Joi.alternatives()
  .try(createdToApprovedSchema)
  .required()
