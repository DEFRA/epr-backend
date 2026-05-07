import { StatusCodes } from 'http-status-codes'
import Joi from 'joi'

import { SCOPES } from '#common/helpers/auth/constants.js'
import { getAuthConfig } from '#common/helpers/auth/get-auth-config.js'

export const adminMePath = '/v1/admin/me'

const responseSchema = Joi.object({
  scopes: Joi.array().items(Joi.string()).required()
}).label('AdminMeResponse')

export const adminMeGet = {
  method: 'GET',
  path: adminMePath,
  options: {
    auth: getAuthConfig([SCOPES.adminRead]),
    tags: ['api', 'admin'],
    response: {
      schema: responseSchema
    }
  },
  /**
   * Echoes the validated token's resolved admin scope bundle.
   * No DB call — the JWT strategy resolves scopes onto the credential and the
   * route's auth.scope guarantees an admin tier reached us.
   * @param {import('#common/hapi-types.js').HapiRequest} request
   * @param {import('#common/hapi-types.js').HapiResponseToolkit} h
   */
  handler: async (request, h) => {
    const credentials = /** @type {{ scope: string[] }} */ (
      /** @type {unknown} */ (request.auth.credentials)
    )
    return h.response({ scopes: credentials.scope }).code(StatusCodes.OK)
  }
}
