import { StatusCodes } from 'http-status-codes'
import Joi from 'joi'

const responseSchema = Joi.object({
  role: Joi.string().allow(null).required(),
  scopes: Joi.array().items(Joi.string()).required()
}).label('MeResponse')

export const meGet = {
  method: 'GET',
  path: '/v1/me',
  options: {
    /**
     * Every signed-in identity may ask who it is, including one that resolves
     * to no role. "You are nobody here" is an answer the caller needs, and a
     * route that required a scope could not give it.
     */
    auth: { scope: false },
    tags: ['api'],
    response: {
      schema: responseSchema
    }
  },
  /**
   * Reports the identity the auth strategy resolved. No DB call — the
   * strategy has already put the role and the scopes on the credential.
   *
   * The scopes are the ones that hold for the identity itself, not for a
   * request: an operator's access to a named organisation is granted per
   * request from that request's organisationId, and this route names none,
   * so it cannot appear here. See ADR 45.
   * @param {import('#common/hapi-types.js').HapiRequest} request
   * @param {import('#common/hapi-types.js').HapiResponseToolkit} h
   */
  handler: async (request, h) => {
    const { role, scope } =
      /** @type {import('#common/hapi-types.js').HumanCredentials} */ (
        request.auth.credentials
      )

    return h.response({ role, scopes: scope }).code(StatusCodes.OK)
  }
}
