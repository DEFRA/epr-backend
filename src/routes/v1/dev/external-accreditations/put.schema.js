import Joi from 'joi'

import { isoDateTimeString } from '#common/validation/iso-date-time-schema.js'
import { tonnageBandSchema } from '#common/validation/tonnage-band-schema.js'
import { ACCREDITATION_STATUSES } from '#organisation-read-model/index.js'
import { organisationParams } from '#routes/organisations/natural-keys.js'

export const externalAccreditationPayloadSchema = Joi.object({
  organisationNumber: organisationParams.organisationNumber,
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
