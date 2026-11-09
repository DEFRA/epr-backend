import Joi from 'joi'
import { StatusCodes } from 'http-status-codes'

import { yearSchema } from '#common/validation/year-schema.js'
import {
  accreditationFields,
  statusTimelineSchema
} from '#external-accreditations/repository/schema.js'
import { registrationParams } from '#routes/organisations/natural-keys.js'

/** @import { HapiRequest, HapiResponseToolkit } from '#common/hapi-types.js' */
/** @import { Year } from '#common/helpers/dates/year.js' */
/** @import { RegistrationNumber } from '#domain/organisations/numbers.js' */
/** @import { ExternalAccreditationsRepository } from '#external-accreditations/repository/port.js' */
/** @import { ExternalAccreditation } from '#organisation-read-model/repository/to-read-model.js' */

/**
 * @typedef {{ registrationNumber: RegistrationNumber, year: Year }} ExternalAccreditationParams
 *
 * @typedef {Omit<ExternalAccreditation, 'registrationNumber' | 'year' | 'status'> & {
 *   status: { timeline: { status: ExternalAccreditation['status']['current'], at: string }[] }
 * }} ExternalAccreditationPayload
 *
 * @typedef {HapiRequest & {
 *   externalAccreditationsRepository: ExternalAccreditationsRepository
 * }} ExternalAccreditationsRequest
 */

export const externalAccreditationPath =
  '/v1/dev/external-accreditations/{registrationNumber}/{year}'

export const externalAccreditationParams = Joi.object({
  registrationNumber: registrationParams.registrationNumber,
  year: yearSchema().required()
})

export const devExternalAccreditationPut = {
  method: 'PUT',
  path: externalAccreditationPath,
  options: {
    auth: false,
    tags: ['api'],
    validate: {
      params: externalAccreditationParams,
      payload: Joi.object({
        ...accreditationFields,
        status: Joi.object({
          timeline: statusTimelineSchema.min(1).required()
        }).required()
      }).required()
    }
  },

  /**
   * @param {ExternalAccreditationsRequest & {
   *   params: ExternalAccreditationParams,
   *   payload: ExternalAccreditationPayload
   * }} request
   * @param {HapiResponseToolkit} h
   */
  handler: async (request, h) => {
    const { registrationNumber, year } = request.params
    /** @type {ExternalAccreditationPayload} */
    const { status, ...fields } = request.payload
    const timeline = status.timeline.toSorted((a, b) =>
      a.at.localeCompare(b.at)
    )
    const stored = await request.externalAccreditationsRepository.upsert({
      ...fields,
      registrationNumber,
      year,
      status: { current: timeline[timeline.length - 1].status, timeline }
    })
    return h.response(stored).code(StatusCodes.OK)
  }
}
