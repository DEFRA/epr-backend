import { http, HttpResponse } from 'msw'
import { publicKey } from '#vite/helpers/create-defra-id-test-tokens.js'

const defraIdBaseUrl =
  'https://dcidmtest.b2clogin.com/DCIDMTest.onmicrosoft.com'

// const bypassSufix = `?p=B2C_1A_CUI_CPDEV_SIGNUPSIGNIN`

export const defraIdMockWellKnownUrl = `${defraIdBaseUrl}/v2.0/.well-known/openid-configuration`
export const defraIdMockJwksUrl = `${defraIdBaseUrl}/discovery/v2.0/keys`

export const defraIdMockOidcWellKnownResponse = {
  authorization_endpoint: `${defraIdBaseUrl}/oauth2/v2.0/authorize`,
  token_endpoint: `${defraIdBaseUrl}/oauth2/v2.0/token`,
  end_session_endpoint: `${defraIdBaseUrl}/oauth2/v2.0/logout`,
  issuer: `${defraIdBaseUrl}/v2.0`,
  jwks_uri: `${defraIdBaseUrl}/discovery/v2.0/keys`
}

/**
 * Generate mock JWKS (JSON Web Key Set) response using the actual test public key
 * @returns {object} JWKS object with the public key from create-test-tokens.js
 */
const createMockJwksResponse = () => ({
  keys: [publicKey]
})

export const validDefraIdMockJwksResponse = createMockJwksResponse()

export const defraIdOidcHandlers = [
  // OIDC discovery endpoint
  http.get(defraIdMockWellKnownUrl, () => {
    return HttpResponse.json(defraIdMockOidcWellKnownResponse)
  }),
  // JWKS endpoint
  http.get(defraIdMockJwksUrl, () => {
    return HttpResponse.json(validDefraIdMockJwksResponse)
  })
]
