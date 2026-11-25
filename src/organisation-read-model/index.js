/**
 * Organisation read model
 *
 * Serves organisations, their registrations and their accreditations in the
 * read model's shape. Its README names the module's entry points.
 *
 * @module organisation-read-model
 */

export { accreditationForYear } from './domain/accreditation-for-year.js'
export {
  ACCREDITATION_STATUSES,
  HELD_ACCREDITATION_STATUSES,
  ORGANISATION_STATUSES,
  REGISTRATION_STATUSES,
  STANDING,
  statusOn
} from './domain/model.js'
export { organisationYears } from './domain/organisation-years.js'
export { standingByYear } from './domain/registration-standing.js'
export { registrationStatusWindows } from './domain/registration-status-windows.js'
export { approvedYears, firstApprovedAt } from './domain/status-timeline.js'
export {
  EXTERNAL_ACCREDITATIONS_COLLECTION_NAME,
  REG_ACCRED_ACCREDITATION_YEAR
} from './repository/external-accreditation-sources.js'
export {
  servesOrganisationOn,
  toLinkedDefraOrganisation
} from './repository/stored-organisation.js'

/** @typedef {import('./repository/port.js').OrganisationReadRepository} OrganisationReadRepository */
/** @typedef {import('./repository/to-read-model.js').ExternalAccreditation} ExternalAccreditation */
/** @typedef {import('./domain/model.js').AccreditationCommon} AccreditationCommon */
/** @typedef {import('./domain/model.js').AccreditationStatus} AccreditationStatus */
/** @typedef {import('./domain/model.js').ExporterAccreditation} ExporterAccreditation */
/** @typedef {import('./domain/model.js').ExporterRegistration} ExporterRegistration */
/** @typedef {import('./domain/model.js').Organisation} Organisation */
/** @typedef {import('./domain/model.js').OverseasSite} OverseasSite */
/** @typedef {import('./domain/model.js').Registration} Registration */
/** @typedef {import('./domain/model.js').RegistrationCommon} RegistrationCommon */
/** @typedef {import('./domain/model.js').ReprocessorAccreditation} ReprocessorAccreditation */
/** @typedef {import('./domain/model.js').ReprocessorRegistration} ReprocessorRegistration */
/** @typedef {import('./domain/model.js').RegistrationStatus} RegistrationStatus */
/** @typedef {import('./domain/model.js').UkAddress} UkAddress */
/** @typedef {import('./domain/status-timeline.js').CalendarDateRange} CalendarDateRange */

/**
 * @template {string} S
 * @typedef {import('./domain/model.js').Status<S>} Status
 */

/**
 * @template {string} S
 * @typedef {import('./domain/model.js').StatusTimeline<S>} StatusTimeline
 */
