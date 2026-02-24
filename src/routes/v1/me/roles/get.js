import { StatusCodes } from 'http-status-codes'

export const rolesGetPath = '/v1/me/roles'

export const rolesGet = {
  method: 'GET',
  path: rolesGetPath,
  options: {
    tags: ['api']
  },
  handler: (request, h) => {
    const { scope = [] } = request.auth.credentials
    return h.response({ roles: scope }).code(StatusCodes.OK)
  }
}
