import Joi from 'joi'

import { isoDateTimeString } from '#common/validation/iso-date-time-schema.js'
import { tonnageBandSchema } from '#common/validation/tonnage-band-schema.js'
import { yearSchema } from '#common/validation/year-schema.js'
import { ORGANISATION_NUMBER_PATTERN } from '#domain/organisations/numbers.js'
import { ACCREDITATION_STATUSES } from '#organisation-read-model/index.js'
import {
  normalisedAccreditationNumberSchema,
  normalisedRegistrationNumberSchema
} from '#repositories/organisations/schema/numbers.js'

const accreditationStatusSchema = Joi.string().valid(...ACCREDITATION_STATUSES)

export const externalAccreditationSchema = Joi.object({
  organisationNumber: Joi.string()
    .pattern(ORGANISATION_NUMBER_PATTERN)
    .required(),
  registrationNumber: normalisedRegistrationNumberSchema.required(),
  year: yearSchema().required(),
  accreditationNumber: normalisedAccreditationNumberSchema.required(),
  prnIssuance: Joi.object({
    tonnageBand: tonnageBandSchema.required()
  }).required(),
  status: Joi.object({
    current: accreditationStatusSchema.required(),
    lastUpdatedAt: isoDateTimeString().required(),
    timeline: Joi.array()
      .items(
        Joi.object({
          at: isoDateTimeString().required(),
          status: accreditationStatusSchema.required()
        })
      )
      .required()
  }).required()
})
