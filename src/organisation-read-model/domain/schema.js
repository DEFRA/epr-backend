import Joi from 'joi'

import { isoDateTimeString } from '#common/validation/iso-date-time-schema.js'
import { TONNAGE_BAND } from '#domain/organisations/model.js'
import { ACCREDITATION_STATUSES } from './model.js'

export const statusTimelineSchema = Joi.array()
  .items(
    Joi.object({
      at: isoDateTimeString().required(),
      status: Joi.string().required()
    })
  )
  .description(
    'Every status change, oldest first. Changes that share a time are in the order they were recorded.'
  )
  .required()

/**
 * @param {readonly string[]} statuses
 */
export const statusSchema = (statuses) =>
  Joi.object({
    current: Joi.string()
      .valid(...statuses)
      .required(),
    timeline: statusTimelineSchema
  }).required()

export const accreditationCommonSchema = Joi.object({
  accreditationNumber: Joi.string().required(),
  prnIssuance: Joi.object({
    tonnageBand: Joi.string()
      .valid(...Object.values(TONNAGE_BAND))
      .required()
  }).required(),
  status: statusSchema(ACCREDITATION_STATUSES)
})
