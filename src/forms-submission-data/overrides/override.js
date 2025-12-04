import { overrideConfig } from '#formsubmission/data-migration-config.js'

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
 * Applies configured overrides to an organisation submission
 *
 * Used to fix data quality issues (e.g., typos in orgId field)
 * for specific organisations identified in FORM_SUBMISSION_OVERRIDES env var
 *
 * @param {Object} submission - The parsed organisation submission
 * @returns {Object} The organisation with overrides applied (if ID matches config)
 */
export function applyOrganisationOverrides(submission) {
  return applyOverride(submission, overrideConfig.organisations)
}
