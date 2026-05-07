import { StatusCodes } from 'http-status-codes'
import Joi from 'joi'

import { SCOPES } from '#common/helpers/auth/constants.js'
import { getAuthConfig } from '#common/helpers/auth/get-auth-config.js'

export const adminMePath = '/v1/admin/me'

const responseSchema = Joi.object({
  role: Joi.string()
    .valid('service_maintainer_write', 'service_maintainer', 'support')
    .allow(null)
    .required(),
  scopes: Joi.array().items(Joi.string()).required()
}).label('AdminMeResponse')

export const adminMeGet = {
  method: 'GET',
  path: adminMePath,
  options: {
    auth: getAuthConfig([
      SCOPES.adminRead,
      SCOPES.adminWrite,
      SCOPES.adminDlqPurge
    ]),
    tags: ['api', 'admin'],
    response: {
      schema: responseSchema
    }
  },
  /**
   * Echoes the validated token's resolved admin role and scope bundle.
   * No DB call — the JWT strategy resolves both onto the credential and the
   * route's auth.scope guarantees an admin tier reached us.
   * @param {import('#common/hapi-types.js').HapiRequest} request
   * @param {import('#common/hapi-types.js').HapiResponseToolkit} h
   */
  handler: async (request, h) => {
    const credentials =
      /** @type {{ role: string | null, scope: string[] }} */ (
        /** @type {unknown} */ (request.auth.credentials)
      )
    return h
      .response({ role: credentials.role, scopes: credentials.scope })
      .code(StatusCodes.OK)
  }
}
