import Joi from 'joi'
import { StatusCodes } from 'http-status-codes'

import { yearSchema } from '#common/validation/year-schema.js'
import { accreditationSchema } from '#external-accreditations/repository/schema.js'
import { registrationParams } from '#routes/organisations/natural-keys.js'

/** @import { HapiRequest, HapiResponseToolkit } from '#common/hapi-types.js' */
/** @import { Year } from '#common/helpers/dates/year.js' */
/** @import { RegistrationNumber } from '#domain/organisations/numbers.js' */
/** @import { ExternalAccreditationsRepository } from '#external-accreditations/repository/port.js' */
/** @import { ExternalAccreditation } from '#organisation-read-model/repository/to-read-model.js' */

/**
 * @typedef {{ registrationNumber: RegistrationNumber, year: Year }} ExternalAccreditationParams
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
      payload: accreditationSchema.required()
    }
  },

  /**
   * @param {ExternalAccreditationsRequest & {
   *   params: ExternalAccreditationParams,
   *   payload: Omit<ExternalAccreditation, 'registrationNumber' | 'year'>
   * }} request
   * @param {HapiResponseToolkit} h
   */
  handler: async (request, h) => {
    const { registrationNumber, year } = request.params
    const { accreditationNumber, prnIssuance, status } = request.payload
    const stored = await request.externalAccreditationsRepository.upsert({
      registrationNumber,
      year,
      accreditationNumber,
      prnIssuance,
      status
    })
    return h.response(stored).code(StatusCodes.OK)
  }
}
