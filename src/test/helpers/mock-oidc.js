import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'

/**
 * Generate mock OIDC configuration response for Defra Id provider
 * Matches the structure returned by cdp-defra-id-stub
 * @param {string} baseUrl - Base URL for the OIDC provider (e.g., 'http://localhost:3200/cdp-defra-id-stub')
 * @returns {object} OIDC configuration object
 */
const createDefraIdMockOidcConfiguration = (baseUrl) => ({
  issuer: baseUrl,
  authorization_endpoint: `${baseUrl}/authorize`,
  token_endpoint: `${baseUrl}/token`,
  userinfo_endpoint: `${baseUrl}/userinfo`,
  end_session_endpoint: `${baseUrl}/logout`,
  jwks_uri: `${new URL(baseUrl).origin}/.well-known/jwks.json`,
  response_types_supported: ['code'],
  subject_types_supported: ['public'],
  id_token_signing_alg_values_supported: ['RS256'],
  scopes_supported: ['openid', 'offline_access'],
  token_endpoint_auth_methods_supported: ['client_secret_post'],
  claims_supported: [
    'sub',
    'correlationId',
    'sessionId',
    'contactId',
    'serviceId',
    'firstName',
    'lastName',
    'email',
    'uniqueReference',
    'loa',
    'aal',
    'enrolmentCount',
    'enrolmentRequestCount',
    'currentRelationshipId',
    'relationships',
    'roles'
  ],
  code_challenge_methods_supported: ['plain', 'S256']
})

/**
 * Generate mock OIDC configuration response
 * Matches the structure returned by epr-re-ex-ebtra-stub
 * @param {string} baseUrl - Base URL for the OIDC provider (e.g., 'http://localhost:3010')
 * @returns {object} OIDC configuration object
 */
const createEntraIdMockOidcConfiguration = (baseUrl) => ({
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
 * Create MSW request handlers for OIDC endpoints
 * @param {string} baseUrl - Base URL for the OIDC provider
 * @returns {Array} MSW request handlers
 */
const createEntraIdOidcHandler = (baseUrl) => {
  const config = createEntraIdMockOidcConfiguration(baseUrl)

  return [
    // OIDC discovery endpoint
    http.get(`${baseUrl}/.well-known/openid-configuration`, () => {
      return HttpResponse.json(config)
    })
  ]
}

/**
 * Create MSW request handlers for OIDC endpoints
 * @param {string} baseUrl - Base URL for the OIDC provider
 * @returns {Array} MSW request handlers
 */
const createDefraIdOidcHandler = (baseUrl) => {
  const config = createDefraIdMockOidcConfiguration(baseUrl)

  return [
    // OIDC discovery endpoint
    http.get(`${baseUrl}/.well-known/openid-configuration`, () => {
      return HttpResponse.json(config)
    })
  ]
}

/**
 * Create and configure MSW server for OIDC tests
 * @param {string} [baseUrl] - Base URL for the OIDC provider (defaults to 'http://localhost:3200/cdp-defra-id-stub')
 * @returns {import('msw/node').SetupServer}
 */
const createMockOidcServers = (
  entraIdBaseUrl = 'http://localhost:3010',
  defraIdBaseUrl = 'http://localhost:3200/cdp-defra-id-stub'
) => {
  const entraIdOidcHandler = createEntraIdOidcHandler(entraIdBaseUrl)
  const defraIdOidcHandler = createDefraIdOidcHandler(defraIdBaseUrl)
  return setupServer(...entraIdOidcHandler, ...defraIdOidcHandler)
}

export {
  createMockOidcServers,
  createDefraIdMockOidcConfiguration,
  createEntraIdMockOidcConfiguration
}
