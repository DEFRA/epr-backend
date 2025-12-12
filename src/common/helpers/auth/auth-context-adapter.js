/**
 * Auth Context Adapter - Tier 2 testing infrastructure
 *
 * This module provides the ports and adapters for decoupling org access
 * checking from JWT validation, enabling integration tests that verify
 * users can only access their own organisation's data.
 *
 * See ADR 0007 (docs/testing/0007-auth-context-adapter-for-testing.md) for details.
 */

/**
 * @typedef {Object} AuthAccess
 * @property {string[]} roles - Roles the user has for this org
 * @property {string | null} linkedOrgId - The org ID the user is linked to
 */

/**
 * @typedef {Object} AuthContextAdapter
 * @property {(userId: string, orgId: string) => Promise<AuthAccess>} getUserOrgAccess
 */

/**
 * Creates an in-memory auth context adapter for testing.
 * Allows tests to explicitly grant user access to specific organisations.
 *
 * @returns {AuthContextAdapter & {
 *   grantAccess: (userId: string, orgId: string, roles?: string[]) => void
 * }}
 */
export const createInMemoryAuthContext = () => {
  /** @type {Map<string, AuthAccess>} */
  const userOrgAccess = new Map()

  return {
    async getUserOrgAccess(userId, orgId) {
      const key = `${userId}:${orgId}`
      return (
        userOrgAccess.get(key) || {
          roles: [],
          linkedOrgId: null
        }
      )
    },

    grantAccess(userId, orgId, roles = ['standardUser']) {
      const key = `${userId}:${orgId}`
      userOrgAccess.set(key, { roles, linkedOrgId: orgId })
    }
  }
}
