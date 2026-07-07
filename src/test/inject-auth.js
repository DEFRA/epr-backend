/**
 * Test helpers for injecting authentication credentials directly into server.inject()
 * calls, bypassing the full JWT validation and org lookup flow.
 *
 * Use these for testing business logic. For testing auth behaviour itself,
 * use the full auth stack with setupAuthContext() and real tokens.
 */

import { ADMIN_ROLES, SCOPES } from '#common/helpers/auth/constants.js'

const ACCESS_TOKEN_STRATEGY = 'access-token'

/**
 * Creates auth injection options for a standard user.
 * @param {{
 *  id?: string,
 *  issuer?: string,
 *  email?: string,
 *  name?: string
 * }?} credentialsOverrides
 * @returns {{
 *   auth: {
 *     strategy: string
 *     credentials: import('#common/hapi-types.js').HumanCredentials
 *   }
 * }} Auth options for server.inject()
 */
export const asOperator = (credentialsOverrides = {}) => {
  return {
    auth: {
      strategy: ACCESS_TOKEN_STRATEGY,
      credentials: {
        scope: [SCOPES.organisationRead, SCOPES.organisationWrite],
        id: credentialsOverrides?.id || 'test-user-id',
        issuer: credentialsOverrides?.issuer || 'test-issuer',
        email: credentialsOverrides?.email || 'test@example.com',
        ...(credentialsOverrides?.name && { name: credentialsOverrides.name }),
        role: null
      }
    }
  }
}

/**
 * @param {string} role
 * @param {{ id?: string, email?: string, overrides?: object }} [opts]
 */
const adminCredential = (
  role,
  {
    id = 'test-maintainer-id',
    email = 'maintainer@example.com',
    overrides
  } = {}
) => ({
  auth: {
    strategy: ACCESS_TOKEN_STRATEGY,
    credentials: {
      scope: [...ADMIN_ROLES[role]],
      id,
      email,
      ...overrides
    }
  }
})

/**
 * Creates auth injection options for a service maintainer (legacy alias).
 *
 * Maps to the write-tier (`service_maintainer_write`) bundle so existing
 * tests that depended on a maintainer having full admin access continue to
 * pass after routes are re-scoped to explicit `admin.*` requirements.
 *
 * For matrix-style four-tier tests use the explicit per-tier helpers below.
 * @param {object} [overrides] - Optional credential overrides
 * @returns {object} Auth options for server.inject()
 */
export const asServiceMaintainer = (overrides = {}) =>
  adminCredential('service_maintainer_write', { overrides })

/**
 * Carries admin.read, admin.write, and admin.dlq.purge.
 */
export const asServiceMaintainerWrite = (overrides = {}) =>
  adminCredential('service_maintainer_write', { overrides })

/**
 * Carries admin.read and admin.dlq.purge (no admin.write).
 */
export const asServiceMaintainerRead = (overrides = {}) =>
  adminCredential('service_maintainer', { overrides })

/**
 * Carries only admin.read.
 */
export const asSupport = (overrides = {}) =>
  adminCredential('support', {
    id: 'test-support-id',
    email: 'support@example.com',
    overrides
  })

/**
 * Authenticated identity with no admin tier — every admin-scoped route 403s.
 */
export const asUnscopedAdminUser = (overrides = {}) => ({
  auth: {
    strategy: ACCESS_TOKEN_STRATEGY,
    credentials: {
      scope: [],
      id: 'test-unscoped-id',
      email: 'unscoped@example.com',
      ...overrides
    }
  }
})

export const ADMIN_TIER_HELPERS = {
  service_maintainer_write: asServiceMaintainerWrite,
  service_maintainer: asServiceMaintainerRead,
  support: asSupport,
  unscoped: asUnscopedAdminUser
}
