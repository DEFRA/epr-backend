import { http, HttpResponse } from 'msw'
import { publicKey } from '#vite/helpers/create-entra-id-test-tokens.js'

const entraIdBaseUrl =
  'https://login.microsoftonline.com/6f504113-6b64-43f2-ade9-242e05780007'

export const entraIdMockWellKnownUrl = `${entraIdBaseUrl}/v2.0/.well-known/openid-configuration`
export const entraIdMockJwksUrl = `${entraIdBaseUrl}/discovery/v2.0/keys`

/**
 * Generate a mock OIDC configuration response for Entra Id provider
 * @param {string} baseUrl - Base URL for the OIDC provider (e.g., 'http://localhost:3010')
 * @returns {object} OIDC configuration object
 */
const createEntraIdMockOidcConfiguration = (baseUrl) => ({
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
  keys: [publicKey]
})

export const entraIdMockOidcWellKnownResponse =
  createEntraIdMockOidcConfiguration(entraIdBaseUrl)

export const validEntraIdMockJwksResponse = createMockJwksResponse()

export const entraIdOidcHandlers = [
  // OIDC discovery endpoint
  http.get(entraIdMockWellKnownUrl, () => {
    return HttpResponse.json(entraIdMockOidcWellKnownResponse)
  }),
  // JWKS endpoint
  http.get(entraIdMockJwksUrl, () => {
    return HttpResponse.json(validEntraIdMockJwksResponse)
  })
]
