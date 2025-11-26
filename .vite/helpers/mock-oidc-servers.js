import { setupServer } from 'msw/node'
import { entraIdOidcHandlers } from './mock-entra-oidc.js'
import { defraIdOidcHandlers } from './mock-defra-id-oidc.js'

/**
 * Create and configure MSW server for OIDC tests
 * @returns {import('msw/node').SetupServer}
 */
export const createMockOidcServers = () => {
  return setupServer(...entraIdOidcHandlers, ...defraIdOidcHandlers)
}
