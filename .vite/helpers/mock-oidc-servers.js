import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'

import { cognitoJwksHandlers } from './mock-cognito-jwks.js'
import { defraIdOidcHandlers } from './mock-defra-id-oidc.js'
import { entraIdOidcHandlers } from './mock-entra-oidc.js'

const awsImdsHandlers = [
  http.put('http://169.254.169.254/latest/api/token', () => {
    return new HttpResponse(null, { status: 403 })
  })
]

/**
 * Create and configure MSW server for OIDC tests
 * @returns {import('msw/node').SetupServer}
 */
export const createMockOidcServers = () => {
  return setupServer(
    ...entraIdOidcHandlers,
    ...defraIdOidcHandlers,
    ...cognitoJwksHandlers,
    ...awsImdsHandlers
  )
}
