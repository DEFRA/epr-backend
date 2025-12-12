/**
 * Test helpers for injecting authentication credentials directly into server.inject()
 * calls, bypassing the full JWT validation and org lookup flow.
 *
 * IMPORTANT: These helpers bypass BOTH Entra ID and Defra ID auth validation entirely.
 * The injected credentials go directly to Hapi's auth system without:
 * - Token signature/expiry validation
 * - Issuer/audience checks
 * - Provider-specific role extraction (getEntraUserRoles/getDefraUserRoles)
 * - The addStandardUserIfNotPresent() side effect
 *
 * USE FOR: Testing business logic (what happens AFTER auth succeeds)
 * DO NOT USE FOR: Testing auth behaviour itself
 *
 * For auth behaviour tests, use setupAuthContext() with real tokens from
 * create-entra-id-test-tokens.js or create-defra-id-test-tokens.js
 *
 * See ADR 0007 (docs/testing/0007-auth-context-adapter-for-testing.md) for details.
 */

import { ROLES } from '#common/helpers/auth/constants.js'

const ACCESS_TOKEN_STRATEGY = 'access-token'

/**
 * Creates auth injection options for a standard user
 * @param {object} [overrides] - Optional credential overrides
 * @returns {object} Auth options for server.inject()
 */
export const asStandardUser = (overrides = {}) => ({
  auth: {
    strategy: ACCESS_TOKEN_STRATEGY,
    credentials: {
      scope: [ROLES.standardUser],
      id: 'test-user-id',
      email: 'test@example.com',
      ...overrides
    }
  }
})

/**
 * Creates auth injection options for a service maintainer
 * @param {object} [overrides] - Optional credential overrides
 * @returns {object} Auth options for server.inject()
 */
export const asServiceMaintainer = (overrides = {}) => ({
  auth: {
    strategy: ACCESS_TOKEN_STRATEGY,
    credentials: {
      scope: [ROLES.serviceMaintainer],
      id: 'test-maintainer-id',
      email: 'maintainer@example.com',
      ...overrides
    }
  }
})

/**
 * Creates auth injection options for a linker
 * @param {object} [overrides] - Optional credential overrides
 * @returns {object} Auth options for server.inject()
 */
export const asLinker = (overrides = {}) => ({
  auth: {
    strategy: ACCESS_TOKEN_STRATEGY,
    credentials: {
      scope: [ROLES.linker],
      id: 'test-linker-id',
      email: 'linker@example.com',
      ...overrides
    }
  }
})

/**
 * Creates auth injection options for an inquirer
 * @param {object} [overrides] - Optional credential overrides
 * @returns {object} Auth options for server.inject()
 */
export const asInquirer = (overrides = {}) => ({
  auth: {
    strategy: ACCESS_TOKEN_STRATEGY,
    credentials: {
      scope: [ROLES.inquirer],
      id: 'test-inquirer-id',
      email: 'inquirer@example.com',
      ...overrides
    }
  }
})
