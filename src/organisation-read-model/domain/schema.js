import Joi from 'joi'

import { isoDateTimeString } from '#common/validation/iso-date-time-schema.js'
import { tonnageBandSchema } from '#common/validation/tonnage-band-schema.js'
import { ACCREDITATION_STATUS } from '#domain/organisations/model.js'
import { normalisedAccreditationNumberSchema } from '#repositories/organisations/schema/numbers.js'
import { ACCREDITATION_STATUSES } from './model.js'

/**
 * @param {Joi.StringSchema} timelineStatus
 */
const statusTimelineSchema = (timelineStatus) =>
  Joi.array()
    .items(
      Joi.object({
        at: isoDateTimeString().required(),
        status: timelineStatus.required()
      })
    )
    .description(
      'Every status change, oldest first. Changes that share a time are in the order they were recorded.'
    )
    .required()

/**
 * @param {readonly string[]} statuses
 * @param {Joi.StringSchema} [timelineStatus]
 */
export const statusSchema = (statuses, timelineStatus = Joi.string()) =>
  Joi.object({
    current: Joi.string()
      .valid(...statuses)
      .required(),
    timeline: statusTimelineSchema(timelineStatus)
  }).required()

export const accreditationCommonSchema = Joi.object({
  accreditationNumber: normalisedAccreditationNumberSchema.required(),
  prnIssuance: Joi.object({
    tonnageBand: tonnageBandSchema.required()
  }).required(),
  status: statusSchema(
    ACCREDITATION_STATUSES,
    Joi.string().valid(...Object.values(ACCREDITATION_STATUS))
  )
})
