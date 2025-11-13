import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { getTestPublicKey } from '#vite/helpers/create-test-tokens.js'

const entraIdBaseUrl =
  'https://login.microsoftonline.com/6f504113-6b64-43f2-ade9-242e05780007'

/**
 * Generate a mock OIDC configuration response for Entra Id provider
 * @param {string} baseUrl - Base URL for the OIDC provider (e.g., 'http://localhost:3010')
 * @returns {object} OIDC configuration object
 */
const createEntraIdMockOidcResponse = (baseUrl) => ({
  authorization_endpoint: `${baseUrl}/oauth2/v2.0/authorize`,
  token_endpoint: `${baseUrl}/oauth2/v2.0/token`,
  end_session_endpoint: `${baseUrl}/oauth2/v2.0/logout`,
  issuer: `${baseUrl}/v2.0`,
  jwks_uri: `${baseUrl}/discovery/v2.0/keys`
})

/**
 * Generate mock JWKS (JSON Web Key Set) response using the actual test public key
 * @returns {object} JWKS object with the public key from create-test-tokens.js
 */
const createMockJwksResponse = () => ({
  keys: [getTestPublicKey()]
})

/**
 * Create MSW request handlers for OIDC endpoints
 * @param {string} baseUrl - Base URL for the OIDC provider
 * @param {object} oidcResponse - OIDC configuration response
 * @returns {Array} MSW request handlers
 */
const createOidcHandlers = (baseUrl, oidcResponse) => {
  const wellKnownUrl = `${baseUrl}/v2.0/.well-known/openid-configuration`
  const jwksUrl = `${baseUrl}/discovery/v2.0/keys`
  const jwksResponse = createMockJwksResponse()

  return [
    // OIDC discovery endpoint
    http.get(wellKnownUrl, () => {
      return HttpResponse.json(oidcResponse)
    }),
    // JWKS endpoint
    http.get(jwksUrl, () => {
      return HttpResponse.json(jwksResponse)
    })
  ]
}

/**
 * Create and configure MSW server for OIDC tests
 * @returns {import('msw/node').SetupServer}
 */
const createMockOidcServers = () => {
  const entraOidcResponse = createEntraIdMockOidcResponse(entraIdBaseUrl)
  const entraIdOidcHandler = createOidcHandlers(
    entraIdBaseUrl,
    entraOidcResponse
  )

  return setupServer(...entraIdOidcHandler)
}

export {
  createMockOidcServers,
  createEntraIdMockOidcResponse as createEntraIdMockOidcConfiguration
}
