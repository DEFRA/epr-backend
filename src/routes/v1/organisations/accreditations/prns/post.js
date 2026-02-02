import { StatusCodes } from 'http-status-codes'
import { ROLES } from '#common/helpers/auth/constants.js'
import Joi from 'joi'
import crypto from 'node:crypto'
import { PRN_STATUS } from '#domain/packaging-recycling-notes/status.js'

/** @typedef {import('#repositories/packaging-recycling-notes/port.js').PackagingRecyclingNotesRepository} PackagingRecyclingNotesRepository */

export const prnPostPath =
  '/v1/organisations/{organisationId}/accreditations/{accreditationId}/prns'

export const prnPost = {
  method: 'POST',
  path: prnPostPath,
  options: {
    auth: {
      scope: [ROLES.standardUser]
    },
    tags: ['api'],
    validate: {
      params: Joi.object({
        organisationId: Joi.string()
          .pattern(/^[a-f0-9]{24}$/)
          .required(),
        accreditationId: Joi.string()
          .pattern(/^[a-f0-9]{24}$/)
          .required()
      }),
      payload: Joi.object({
        tonnage: Joi.number().integer().positive().required(),
        issuedToOrganisation: Joi.object({
          id: Joi.string().uuid().required(),
          name: Joi.string().required(),
          tradingName: Joi.string().optional()
        }).required(),
        issuerNotes: Joi.string().max(200).required()
      })
    }
  },
  /**
   * @param {import('#common/hapi-types.js').HapiRequest & {packagingRecyclingNotesRepository: PackagingRecyclingNotesRepository}} request
   * @param {import('#common/hapi-types.js').HapiResponseToolkit} h
   * @returns {Promise<import('#common/hapi-types.js').HapiResponseObject>}
   */
  handler: async (
    { packagingRecyclingNotesRepository, params, payload },
    h
  ) => {
    const { organisationId, accreditationId } = params
    // @ts-ignore
    const { tonnage, issuedToOrganisation, issuerNotes } = payload

    const id = crypto.randomUUID()

    const prn = {
      organisationId,
      accreditationId,
      tonnageValue: tonnage,
      issuedToOrganisation,
      issuerNotes,
      createdAt: new Date(),
      status: {
        currentStatus: PRN_STATUS.DRAFT
      }
    }

    await packagingRecyclingNotesRepository.insert(id, prn)

    return h.response({ id, ...prn }).code(StatusCodes.CREATED)
  }
}
