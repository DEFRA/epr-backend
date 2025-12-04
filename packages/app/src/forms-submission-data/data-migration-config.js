import { config } from '#root/config.js'

/**
 * Loads and parses override configuration from environment variable
 *
 * @returns {Object} Override config with registrations and accreditations arrays
 */
function loadOverrideConfig() {
  const overridesJson = config.get('formSubmissionOverrides')
  return JSON.parse(overridesJson)
}

// Parse override config from environment variable (set via cdp-app-config)
export const overrideConfig = loadOverrideConfig()

/**
 * Gets the set of systemReferences that require orgId validation during linking
 *
 * These systemReferences require additional validation to prevent misuse.
 * Registrations/accreditations with these systemReferences can only be linked
 * to organisations where the orgId matches, preventing unauthorized linking.
 *
 * @returns {Set<string>} Set of systemReferences requiring orgId validation
 */
export function systemReferencesRequiringOrgIdMatch() {
  const configValue = config.get('systemReferencesRequiringOrgIdMatch')
  const systemReferences = JSON.parse(configValue)
  return new Set(systemReferences)
}
