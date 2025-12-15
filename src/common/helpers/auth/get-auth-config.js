import { config } from '#root/config.js'

/**
 * Returns auth configuration based on the defraIdAuth feature flag.
 * When the flag is enabled, returns scope-based auth config.
 * When disabled, returns false (no auth required).
 *
 * @param {string[]} scopes - Array of required scopes/roles
 * @returns {{ scope: string[] } | false}
 */
export function getAuthConfig(scopes) {
  return config.get('featureFlags.defraIdAuth') ? { scope: scopes } : false
}
