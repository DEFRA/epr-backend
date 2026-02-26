import { StatusCodes } from 'http-status-codes'
import { getEntraUserRoles } from '#common/helpers/auth/get-entra-user-roles.js'

export const rolesGetPath = '/v1/me/roles'

export const rolesGet = {
  method: 'GET',
  path: rolesGetPath,
  options: {
    tags: ['api']
  },
  handler: async (request, h) => {
    const { email } = request.auth.credentials
    const roles = await getEntraUserRoles(email)
    return h.response({ roles }).code(StatusCodes.OK)
  }
}
