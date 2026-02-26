import { StatusCodes } from 'http-status-codes'

export const scopeGetPath = '/v1/me/scope'

export const scopeGet = {
  method: 'GET',
  path: scopeGetPath,
  options: {
    tags: ['api']
  },
  handler: async (request, h) => {
    return h
      .response({ scope: request.auth.credentials.scope })
      .code(StatusCodes.OK)
  }
}
