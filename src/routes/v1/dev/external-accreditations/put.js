import Boom from '@hapi/boom'
import Joi from 'joi'
import { StatusCodes } from 'http-status-codes'

import { yearSchema } from '#common/validation/year-schema.js'
import { WASTE_PROCESSING_TYPE } from '#domain/organisations/model.js'
import { registrationParams } from '#routes/organisations/natural-keys.js'
import { externalAccreditationPayloadSchema } from './put.schema.js'

/** @import { HapiRequest, HapiResponseToolkit } from '#common/hapi-types.js' */
/** @import { Year } from '#common/helpers/dates/year.js' */
/** @import { RegistrationNumber } from '#domain/organisations/numbers.js' */
/** @import { ExternalAccreditationsRepository } from '#external-accreditations/repository/port.js' */
/** @import { ExternalAccreditation } from '#organisation-read-model/repository/to-read-model.js' */
/** @import { OrganisationReadRepository } from '#organisation-read-model/repository/port.js' */

/**
 * @typedef {{ registrationNumber: RegistrationNumber, year: Year }} ExternalAccreditationParams
 *
 * @typedef {Omit<ExternalAccreditation, 'registrationNumber' | 'year' | 'status'> & {
 *   status: { timeline: { status: ExternalAccreditation['status']['current'], at: string, updatedAt: string }[] }
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

/**
 * @param {OrganisationReadRepository} organisationReadRepository
 * @param {RegistrationNumber} registrationNumber
 */
const isExporterRegistration = async (
  organisationReadRepository,
  registrationNumber
) => {
  const { items } = await organisationReadRepository.find({
    registrationNumber,
    page: 1,
    pageSize: 1
  })
  return (
    items[0]?.registrations[registrationNumber]?.wasteProcessingType ===
    WASTE_PROCESSING_TYPE.EXPORTER
  )
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
    if (
      'overseasSites' in fields &&
      !(await isExporterRegistration(
        request.organisationReadRepository,
        registrationNumber
      ))
    ) {
      throw Boom.badData(
        `Registration ${registrationNumber} is not an exporter, so its accreditation has no overseas sites`
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
      status: { current: latest.status, timeline }
    })
    return h.response(stored).code(StatusCodes.OK)
  }
}
