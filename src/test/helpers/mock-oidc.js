import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'

const entraIdBaseUrl =
  'https://login.microsoftonline.com/6f504113-6b64-43f2-ade9-242e05780007/v2.0'

/**
 * Generate mock OIDC configuration response for Entra Id provider
 * Matches the structure returned by epr-re-ex-entra-stub
 * @param {string} baseUrl - Base URL for the OIDC provider (e.g., 'http://localhost:3010')
 * @returns {object} OIDC configuration object
 */
const createEntraIdMockOidcResponse = (baseUrl) => ({
  token_endpoint: `${baseUrl}/token`,
  token_endpoint_auth_methods_supported: [
    'client_secret_post',
    'private_key_jwt',
    'client_secret_basic'
  ],
  jwks_uri: `${baseUrl}/jwks`,
  response_modes_supported: ['query', 'fragment', 'form_post'],
  subject_types_supported: ['pairwise'],
  id_token_signing_alg_values_supported: ['RS256'],
  response_types_supported: [
    'code',
    'id_token',
    'code id_token',
    'id_token token'
  ],
  scopes_supported: ['openid', 'profile', 'email', 'offline_access'],
  issuer: 'https://login.microsoftonline.com/tenantId/v2.0',
  request_uri_parameter_supported: false,
  userinfo_endpoint: 'https://graph.microsoft.com/oidc/userinfo',
  authorization_endpoint: `${baseUrl}/authorize`,
  device_authorization_endpoint: `${baseUrl}/devicecode`,
  http_logout_supported: true,
  frontchannel_logout_supported: true,
  end_session_endpoint: `${baseUrl}/clientId/logout`,
  claims_supported: [
    'sub',
    'iss',
    'cloud_instance_name',
    'cloud_instance_host_name',
    'cloud_graph_host_name',
    'msgraph_host',
    'aud',
    'exp',
    'iat',
    'auth_time',
    'acr',
    'nonce',
    'preferred_username',
    'name',
    'tid',
    'ver',
    'at_hash',
    'c_hash',
    'email'
  ],
  kerberos_endpoint: `${baseUrl}/tenantId/kerberos`,
  tenant_region_scope: 'EU',
  cloud_instance_name: 'microsoftonline.com',
  cloud_graph_host_name: 'graph.windows.net',
  msgraph_host: 'graph.microsoft.com',
  rbac_url: 'https://pas.windows.net'
})

/**
 * Generate mock JWKS (JSON Web Key Set) response
 * @returns {object} JWKS object with mock public keys
 */
const createMockJwksResponse = () => ({
  keys: [
    {
      kty: 'RSA',
      use: 'sig',
      kid: 'test-key-id',
      n: 'xGOr-H7A-PWbPyHHKLogFB-kh3J-KLcZKJb8VyOENiFoNkEG-wFPcB8-sxC6L7CW5q9qEMIjHBDlFbqQbHSKqwk',
      e: 'AQAB',
      alg: 'RS256'
    }
  ]
})

/**
 * Create MSW request handlers for OIDC endpoints
 * @param {string} baseUrl - Base URL for the OIDC provider
 * @param {object} oidcResponse - OIDC configuration response
 * @returns {Array} MSW request handlers
 */
const createOidcHandler = (baseUrl, oidcResponse) => {
  const wellKnownUrl = `${baseUrl}/.well-known/openid-configuration`
  const jwksUrl = `${baseUrl}/jwks`
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
 * @param {string} [baseUrl] - Base URL for the OIDC provider (defaults to 'http://localhost:3200/cdp-defra-id-stub')
 * @returns {import('msw/node').SetupServer}
 */
const createMockOidcServers = () => {
  const entraOidcResponse = createEntraIdMockOidcResponse(entraIdBaseUrl)
  const entraIdOidcHandler = createOidcHandler(
    entraIdBaseUrl,
    entraOidcResponse
  )

  return setupServer(...entraIdOidcHandler)
}

export {
  createMockOidcServers,
  createEntraIdMockOidcResponse as createEntraIdMockOidcConfiguration
}
