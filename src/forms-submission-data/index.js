/**
 * Forms submission data
 *
 * Holds the organisation, registration and accreditation submissions made
 * through the Defra forms, and migrates them into organisations. Its README
 * names the module's entry points.
 *
 * @module forms-submission-data
 */

export {
  accreditationFactory,
  organisationFactory,
  registrationFactory
} from './apply/collections/factories/index.js'
export {
  extractAnswers,
  extractEmail,
  extractOrgName
} from './apply/extract-answers.js'
export {
  getRegAccKey,
  isAccreditationForRegistration
} from './submission-keys.js'

/** @typedef {import('./repository/port.js').FormSubmissionsRepository} FormSubmissionsRepository */
