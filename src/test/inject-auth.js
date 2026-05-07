/**
 * Test helpers for injecting authentication credentials directly into server.inject()
 * calls, bypassing the full JWT validation and org lookup flow.
 *
 * Use these for testing business logic. For testing auth behaviour itself,
 * use the full auth stack with setupAuthContext() and real tokens.
 */

import { ADMIN_ROLES, ROLES } from '#common/helpers/auth/constants.js'
// ROLES is imported only for the operator-side `asStandardUser` helper below.

const ACCESS_TOKEN_STRATEGY = 'access-token'

/**
 * Creates auth injection options for a standard user.
 * Requires linkedOrgId because a standard user is always linked to an
 * organisation via their Defra ID relationships.
 * @param {object} options - Options object
 * @param {string} options.linkedOrgId - The organisation ID the user is linked to
 * @param {object} [options.overrides] - Additional credential overrides
 * @returns {object} Auth options for server.inject()
 */
export const asStandardUser = ({ linkedOrgId, ...overrides }) => {
  if (!linkedOrgId) {
    throw new Error('linkedOrgId is required for asStandardUser')
  }
  return {
    auth: {
      strategy: ACCESS_TOKEN_STRATEGY,
      credentials: {
        scope: [ROLES.standardUser],
        id: 'test-user-id',
        email: 'test@example.com',
        linkedOrgId,
        ...overrides
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
      role,
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
      role: null,
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
