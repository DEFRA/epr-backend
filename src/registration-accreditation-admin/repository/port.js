/** @import { Accreditation } from '#domain/organisations/accreditation.js' */
/** @import { Organisation } from '#domain/organisations/model.js' */
/** @import { Registration } from '#domain/organisations/registration.js' */
/** @import { AccreditationNumber, OrganisationNumber, RegistrationNumber } from '#domain/organisations/numbers.js' */

/**
 * Organisation replacement payload with identity fields removed. Identity (id,
 * version) is passed as separate parameters to replace().
 *
 * Organisation-level statusHistory is server-owned and is omitted here, but the
 * Registration and Accreditation item types carry their own statusHistory and
 * replace() honours it for an existing item whose status is unchanged, so an
 * admin can correct its updatedAt dates.
 * @typedef {Partial<Omit<Organisation, 'id'|'version'|'statusHistory'>>} OrganisationReplacement
 */

/**
 * The admin routes' port onto whole organisations, including registrations
 * and accreditations that have no number. It reads and writes the same store
 * as the organisations repository, through functions of its own, so the
 * module can be deleted without touching the numbered code.
 *
 * @typedef {Object} RegistrationAccreditationAdminRepository
 * @property {(id: string, version: number, replacement: OrganisationReplacement) => Promise<void>} replace
 * @property {(id: string, minimumVersion?: number) => Promise<Organisation>} findById
 * @property {(organisationNumber: OrganisationNumber, minimumVersion?: number) => Promise<Organisation|null>} findByOrganisationNumber - With `minimumVersion`, waits for that version to be readable, and throws 500 if it never is
 * @property {(organisationId: string, registrationId: string, minimumOrgVersion?: number) => Promise<Registration>} findRegistrationById
 * @property {(organisationId: string, accreditationId: string, minimumOrgVersion?: number) => Promise<Accreditation>} findAccreditationById
 * @property {(accreditationNumber: AccreditationNumber) => Promise<boolean>} isAccreditationNumberInUse - Whether any accreditation in any organisation holds this number, regardless of the accreditation's status
 * @property {(registrationNumber: RegistrationNumber) => Promise<boolean>} isRegistrationNumberInUse - Whether any registration in any organisation holds this number, regardless of the registration's status
 */

export {} // NOSONAR: javascript:S7787 - Required to make this file a module for JSDoc @import
