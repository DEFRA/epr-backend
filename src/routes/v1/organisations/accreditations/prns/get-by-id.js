import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'
import { ROLES } from '#common/helpers/auth/constants.js'
import Joi from 'joi'

/** @typedef {import('#repositories/packaging-recycling-notes/port.js').PackagingRecyclingNotesRepository} PackagingRecyclingNotesRepository */

export const prnGetByIdPath =
  '/v1/organisations/{organisationId}/accreditations/{accreditationId}/prns/{prnId}'

export const prnGetById = {
  method: 'GET',
  path: prnGetByIdPath,
  options: {
    auth: {
      scope: [ROLES.standardUser]
    },
    tags: ['api'],
    validate: {
      params: Joi.object({
        organisationId: Joi.string().uuid().required(),
        accreditationId: Joi.string().uuid().required(),
        prnId: Joi.string().uuid().required()
      })
    }
  },
  /**
   * @param {import('#common/hapi-types.js').HapiRequest & {packagingRecyclingNotesRepository: PackagingRecyclingNotesRepository}} request
   * @param {import('#common/hapi-types.js').HapiResponseToolkit} h
   * @returns {Promise<import('#common/hapi-types.js').HapiResponseObject>}
   */
  handler: async ({ packagingRecyclingNotesRepository, params }, h) => {
    const { organisationId, accreditationId, prnId } = params

    const prn = await packagingRecyclingNotesRepository.findById(prnId)

    if (
      !prn ||
      prn.organisationId !== organisationId ||
      prn.accreditationId !== accreditationId
    ) {
      throw Boom.notFound(`PRN/PERN ${prnId} not found`)
    }

    return h.response(prn).code(StatusCodes.OK)
  }
}
