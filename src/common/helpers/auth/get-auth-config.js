/**
 * Returns Hapi route auth configuration for the given scopes.
 *
 * @param {string[]} scopes - Array of required scopes/roles
 * @returns {{ scope: string[] }}
 */
export function getAuthConfig(scopes) {
  return { scope: scopes }
}
