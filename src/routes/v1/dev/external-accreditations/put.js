import Boom from '@hapi/boom'
import Joi from 'joi'
import { StatusCodes } from 'http-status-codes'

import { yearSchema } from '#common/validation/year-schema.js'
import { REG_ACCRED_ACCREDITATION_YEAR } from '#organisation-read-model/repository/reg-accred-accreditations.js'
import { registrationParams } from '#routes/organisations/natural-keys.js'
import { externalAccreditationPayloadSchema } from './put.schema.js'

/** @import { HapiRequest, HapiResponseToolkit } from '#common/hapi-types.js' */
/** @import { Year } from '#common/helpers/dates/year.js' */
/** @import { OrganisationNumber, RegistrationNumber } from '#domain/organisations/numbers.js' */
/** @import { ExternalAccreditationsRepository } from '#external-accreditations/repository/port.js' */
/** @import { ExternalAccreditation } from '#organisation-read-model/repository/to-read-model.js' */
/** @import { OrganisationReadRepository } from '#organisation-read-model/repository/port.js' */

/**
 * @typedef {{ registrationNumber: RegistrationNumber, year: Year }} ExternalAccreditationParams
 *
 * @typedef {Omit<ExternalAccreditation, 'registrationNumber' | 'year' | 'status'> & {
 *   status: Omit<ExternalAccreditation['status'], 'current'>
 * }} ExternalAccreditationPayload
 *
 * @typedef {HapiRequest & {
 *   externalAccreditationsRepository: ExternalAccreditationsRepository
 * }} ExternalAccreditationsRequest
 */

export const externalAccreditationPath =
  '/v1/dev/external-accreditations/{registrationNumber}/{year}'

/**
 * Only 2027 is accepted: the read model loads external accreditations for
 * that year alone, so one stored for any other year would never be served.
 */
export const externalAccreditationParams = Joi.object({
  registrationNumber: registrationParams.registrationNumber,
  year: yearSchema().valid(REG_ACCRED_ACCREDITATION_YEAR).required()
})

/**
 * The organisation's registration with the number, or null when the
 * organisation does not hold it.
 *
 * @param {OrganisationReadRepository} organisationReadRepository
 * @param {OrganisationNumber} organisationNumber
 * @param {RegistrationNumber} registrationNumber
 */
const registrationOf = async (
  organisationReadRepository,
  organisationNumber,
  registrationNumber
) => {
  const organisation =
    await organisationReadRepository.findByOrganisationNumber(
      organisationNumber
    )
  return organisation?.registrations[registrationNumber] ?? null
}

export const devExternalAccreditationPut = {
  method: 'PUT',
  path: externalAccreditationPath,
  options: {
    auth: false,
    tags: ['api'],
    validate: {
      params: externalAccreditationParams,
      payload: externalAccreditationPayloadSchema.required()
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
    const registration = await registrationOf(
      request.organisationReadRepository,
      fields.organisationNumber,
      registrationNumber
    )
    if (!registration) {
      throw Boom.badData(
        `Organisation ${fields.organisationNumber} holds no registration ${registrationNumber}`
      )
    }
    const timeline = status.timeline.toSorted((a, b) =>
      a.at.localeCompare(b.at)
    )
    const [latest] = timeline.slice(-1)
    const stored = await request.externalAccreditationsRepository.upsert({
      ...fields,
      registrationNumber,
      year,
      status: {
        current: latest.status,
        lastUpdatedAt: status.lastUpdatedAt,
        timeline
      }
    })
    return h.response(stored).code(StatusCodes.OK)
  }
}
