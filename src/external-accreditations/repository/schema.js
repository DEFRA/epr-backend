import Joi from 'joi'

import { yearSchema } from '#common/validation/year-schema.js'
import { TONNAGE_BAND } from '#domain/organisations/model.js'
import { ACCREDITATION_STATUSES } from '#organisation-read-model/domain/model.js'
import {
  normalisedAccreditationNumberSchema,
  normalisedRegistrationNumberSchema
} from '#repositories/organisations/schema/numbers.js'

/**
 * Joi's `isoDate` rewrites any parseable value rather than rejecting it, so a
 * round trip holds the value to the form `toISOString` writes.
 */
const isoDateTimeString = Joi.string()
  .custom((value, helpers) => {
    const date = new Date(value)
    if (Number.isNaN(date.getTime()) || date.toISOString() !== value) {
      return helpers.error('string.isoDateTime')
    }
    return value
  })
  .messages({
    'string.isoDateTime': 'Date-time must be in YYYY-MM-DDTHH:mm:ss.sssZ format'
  })

const accreditationStatusSchema = Joi.string().valid(...ACCREDITATION_STATUSES)

export const statusTimelineSchema = Joi.array().items(
  Joi.object({
    at: isoDateTimeString.required(),
    status: accreditationStatusSchema.required()
  })
)

export const accreditationFields = {
  accreditationNumber: normalisedAccreditationNumberSchema.required(),
  prnIssuance: Joi.object({
    tonnageBand: Joi.string()
      .valid(...Object.values(TONNAGE_BAND))
      .required()
  }).required()
}

export const externalAccreditationSchema = Joi.object({
  registrationNumber: normalisedRegistrationNumberSchema.required(),
  year: yearSchema().required(),
  ...accreditationFields,
  status: Joi.object({
    current: accreditationStatusSchema.required(),
    timeline: statusTimelineSchema.required()
  }).required()
})
