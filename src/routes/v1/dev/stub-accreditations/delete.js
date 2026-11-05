import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'

import { stubAccreditationParams, stubAccreditationPath } from './put.js'

/** @import { HapiRequest, HapiResponseToolkit } from '#common/hapi-types.js' */
/** @import { StubAccreditationParams } from './put.js' */

export const devStubAccreditationDelete = {
  method: 'DELETE',
  path: stubAccreditationPath,
  options: {
    auth: false,
    tags: ['api'],
    validate: { params: stubAccreditationParams }
  },

  /**
   * @param {HapiRequest & { params: StubAccreditationParams }} request
   * @param {HapiResponseToolkit} h
   */
  handler: async (request, h) => {
    const { registrationNumber, year } = request.params
    const removed = await request.futureAccreditationsRepository.remove(
      registrationNumber,
      year
    )
    if (!removed) {
      throw Boom.notFound('No stub accreditation held for that year')
    }
    return h.response(removed).code(StatusCodes.OK)
  }
}
