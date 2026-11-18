import Joi from 'joi'

import { isoDateTimeString } from '#common/validation/iso-date-time-schema.js'
import { tonnageBandSchema } from '#common/validation/tonnage-band-schema.js'
import {
  ORGANISATION_NUMBER_PATTERN,
  REGISTRATION_NUMBER_PATTERN,
  toOrganisationNumber,
  toRegistrationNumber
} from '#domain/organisations/numbers.js'
import { ACCREDITATION_STATUSES } from '../../domain/model.js'

export const registrationNumberParam = Joi.string()
  .pattern(REGISTRATION_NUMBER_PATTERN)
  .custom(toRegistrationNumber)
  .required()

export const externalAccreditationPayloadSchema = Joi.object({
  organisationNumber: Joi.string()
    .pattern(ORGANISATION_NUMBER_PATTERN)
    .custom(toOrganisationNumber)
    .required(),
  accreditationNumber: Joi.string().required(),
  prnIssuance: Joi.object({
    tonnageBand: tonnageBandSchema.required()
  }).required(),
  status: Joi.object({
    lastUpdatedAt: isoDateTimeString().required(),
    timeline: Joi.array()
      .items(
        Joi.object({
          at: isoDateTimeString().required(),
          status: Joi.string()
            .valid(...ACCREDITATION_STATUSES)
            .required()
        })
      )
      .min(1)
      .required()
  }).required()
})
