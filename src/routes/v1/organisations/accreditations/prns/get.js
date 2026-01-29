import { StatusCodes } from 'http-status-codes'
import { ROLES } from '#common/helpers/auth/constants.js'
import Joi from 'joi'
import { prnListResponseSchema } from './response.schema.js'

/** @typedef {import('#repositories/packaging-recycling-notes/port.js').PackagingRecyclingNotesRepository} PackagingRecyclingNotesRepository */

export const prnsGetPath =
  '/v1/organisations/{organisationId}/accreditations/{accreditationId}/prns'

export const prnsGet = {
  method: 'GET',
  path: prnsGetPath,
  options: {
    app: { usesRefactoredDefraIdAuth: true },
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
      })
    },
    response: {
      schema: prnListResponseSchema
    }
  },
  /**
   * @param {import('#common/hapi-types.js').HapiRequest & {packagingRecyclingNotesRepository: PackagingRecyclingNotesRepository}} request
   * @param {import('#common/hapi-types.js').HapiResponseToolkit} h
   * @returns {Promise<import('#common/hapi-types.js').HapiResponseObject>}
   */
  handler: async ({ packagingRecyclingNotesRepository, params }, h) => {
    const { organisationId, accreditationId } = params

    const prns =
      await packagingRecyclingNotesRepository.findByAccreditationId(
        accreditationId
      )

    // Verify all returned PRNs belong to the specified organisation
    const hasUnauthorizedPrn = prns.some(
      (prn) => prn.organisationId !== organisationId
    )

    if (hasUnauthorizedPrn) {
      return h
        .response({
          statusCode: StatusCodes.FORBIDDEN,
          error: 'Forbidden',
          message: `Accreditation ${accreditationId} does not belong to organisation ${organisationId}`
        })
        .code(StatusCodes.FORBIDDEN)
    }

    const items = prns.map((prn) => ({
      id: prn._id.toString(),
      prnNumber: prn.prnNumber,
      issuedToOrganisation: {
        name: prn.issuedToOrganisation.name,
        ...(prn.issuedToOrganisation.tradingName && {
          tradingName: prn.issuedToOrganisation.tradingName
        })
      },
      tonnageValue: prn.tonnageValue,
      createdAt: prn.createdAt.toISOString(),
      status: prn.status.currentStatus
    }))

    return h
      .response({
        items,
        hasMore: false
      })
      .code(StatusCodes.OK)
  }
}
