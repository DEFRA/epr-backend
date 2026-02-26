import { StatusCodes } from 'http-status-codes'

export const rolesGetPath = '/v1/me/roles'

export const rolesGet = {
  method: 'GET',
  path: rolesGetPath,
  options: {
    tags: ['api']
  },
  handler: async (request, h) => {
    return h
      .response({ roles: request.auth.credentials.scope })
      .code(StatusCodes.OK)
  }
}
