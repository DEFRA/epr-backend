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
 * Applies field overrides to a submission based on its ID
 *
 * @param {Object} submission - The parsed submission object
 * @param {Array<{id: string, overrides: Object}>} overrides - Array of override configurations
 * @returns {Object} The submission with overrides applied (if match found) or unchanged
 */
function applyOverride(submission, overrides) {
  const overrideEntry = overrides.find(
    (override) => override.id === submission.id
  )
  if (overrideEntry) {
    return { ...submission, ...overrideEntry.overrides }
  }
  return submission
}

/**
 * Applies configured overrides to a registration submission
 *
 * Used to fix data quality issues (e.g., typos in systemReference field)
 * for specific registrations identified in FORM_SUBMISSION_OVERRIDES env var
 *
 * @param {Object} submission - The parsed registration submission
 * @returns {Object} The registration with overrides applied (if ID matches config)
 */
export function applyRegistrationOverrides(submission) {
  return applyOverride(submission, overrideConfig.registrations)
}

/**
 * Applies configured overrides to an accreditation submission
 *
 * Used to fix data quality issues (e.g., typos in systemReference field)
 * for specific accreditations identified in FORM_SUBMISSION_OVERRIDES env var
 *
 * @param {Object} submission - The parsed accreditation submission
 * @returns {Object} The accreditation with overrides applied (if ID matches config)
 */
export function applyAccreditationOverrides(submission) {
  return applyOverride(submission, overrideConfig.accreditations)
}

/**
 * Gets the set of registration IDs that have overrides configured
 *
 * @returns {Set<string>} Set of registration IDs requiring orgId validation
 */
export function getRegistrationOverrideIds() {
  return new Set(overrideConfig.registrations.map((item) => item.id))
}

/**
 * Gets the set of accreditation IDs that have overrides configured
 *
 * @returns {Set<string>} Set of accreditation IDs requiring orgId validation
 */
export function getAccreditationOverrideIds() {
  return new Set(overrideConfig.accreditations.map((item) => item.id))
}
