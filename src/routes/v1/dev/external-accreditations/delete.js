import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'

import {
  externalAccreditationParams,
  externalAccreditationPath
} from './put.js'

/** @import { HapiResponseToolkit } from '#common/hapi-types.js' */
/** @import { ExternalAccreditationParams, ExternalAccreditationsRequest } from './put.js' */

export const devExternalAccreditationDelete = {
  method: 'DELETE',
  path: externalAccreditationPath,
  options: {
    auth: false,
    tags: ['api'],
    validate: { params: externalAccreditationParams }
  },

  /**
   * @param {ExternalAccreditationsRequest & { params: ExternalAccreditationParams }} request
   * @param {HapiResponseToolkit} h
   */
  handler: async (request, h) => {
    const { registrationNumber, year } = request.params
    const removed = await request.externalAccreditationsRepository.remove(
      registrationNumber,
      year
    )
    if (!removed) {
      throw Boom.notFound('No external accreditation held for that year')
    }
    return h.response().code(StatusCodes.NO_CONTENT)
  }
}
