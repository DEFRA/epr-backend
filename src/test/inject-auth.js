/**
 * Test helpers for injecting authentication credentials directly into server.inject()
 * calls, bypassing the full JWT validation and org lookup flow.
 *
 * Use these for testing business logic. For testing auth behaviour itself,
 * use the full auth stack with setupAuthContext() and real tokens.
 */

import { ROLES } from '#common/helpers/auth/constants.js'

/**
 * Creates auth injection options for a standard user
 * @param {object} [overrides] - Optional credential overrides
 * @returns {object} Auth options for server.inject()
 */
export const asStandardUser = (overrides = {}) => ({
  auth: {
    strategy: 'access-token',
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
    strategy: 'access-token',
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
    strategy: 'access-token',
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
    strategy: 'access-token',
    credentials: {
      scope: [ROLES.inquirer],
      id: 'test-inquirer-id',
      email: 'inquirer@example.com',
      ...overrides
    }
  }
})
