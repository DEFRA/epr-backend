import Boom from '@hapi/boom'
import Jwt from '@hapi/jwt'

export const extractAndDecodeTokenFromHeader = (request) => {
  const authorizationHeader = request.headers.authorization

  if (!authorizationHeader) {
    throw Boom.unauthorized('Missing authentication header')
  }

  const [authScheme, token] = request.headers.authorization.split(/\s+/)

  if (authScheme !== 'Bearer' || !token) {
    throw Boom.unauthorized('Invalid authentication header format')
  }

  try {
    return Jwt.token.decode(token).decoded.payload
  } catch (err) {
    throw Boom.unauthorized('Invalid token')
  }
}
