/** @import {Accreditation} from '#domain/organisations/accreditation.js' */
/** @import {Organisation} from '#domain/organisations/model.js' */
/** @import {Registration} from '#domain/organisations/registration.js' */
/** @import {AccreditationNumber, OrganisationNumber, RegistrationNumber} from '#domain/organisations/numbers.js' */

/**
 * @typedef {Object} OrganisationIds
 * @property {Set<string>} organisations - Set of organisation IDs
 * @property {Set<string>} registrations - Set of registration IDs
 * @property {Set<string>} accreditations - Set of accreditation IDs
 */

/**
 * Organisation replacement payload with identity fields removed.
 * Identity (id, version) is passed as separate parameters to replace().
 *
 * Organisation-level statusHistory is server-owned and is omitted here, but the
 * Registration and Accreditation item types carry their own statusHistory and
 * replace() honours it for an existing item whose status is unchanged, so an
 * admin can correct its updatedAt dates.
 * @typedef {Partial<Omit<Organisation, 'id'|'version'|'statusHistory'>>} OrganisationReplacement
 */

/**
 * What to search organisations for. Every criterion that carries a value is
 * ANDed with the others; an empty string or undefined is treated as absent, so
 * an empty object matches everything.
 *
 * Criteria match anywhere on the organisation's registrations and
 * accreditations — a registration criterion and an accreditation criterion are
 * not required to describe a linked pair.
 * @typedef {Object} SearchCriteria
 * @property {string} [search] - case-insensitive substring on companyDetails.name
 * @property {string} [organisationNumber] - a value that is not an organisation number matches nothing
 * @property {string} [registrationNumber] - case-insensitive exact match on registrations[].registrationNumber
 * @property {string} [accreditationNumber] - case-insensitive exact match on accreditations[].accreditationNumber
 */

/**
 * A {@link SearchCriteria} query plus the page of results to return it in.
 * @typedef {SearchCriteria & { page: number, pageSize: number }} FindParams
 */

/**
 * The registration and accreditation context's port onto whole organisations,
 * including registrations and accreditations that have no number. That context
 * is leaving epr-backend, so only its admin routes and data tooling use this
 * port. epr-backend's own domain reads through the organisation read
 * repository, which returns only numbered records. A test pins which modules
 * may use this port.
 *
 * @typedef {Object} OrganisationAdministrationRepository
 * @property {(organisation: Omit<Organisation, 'status'>) => Promise<void>} insert
 * @property {(id: string, version: number, replacement: OrganisationReplacement) => Promise<void>} replace
 * @property {() => Promise<Organisation[]>} findAll
 * @property {(params: FindParams) => Promise<{ items: Organisation[], page: number, pageSize: number, totalItems: number, totalPages: number }>} find - Find organisations matching every criterion in SearchCriteria, ANDed together; results sorted alphabetically by name and returned a page at a time
 * @property {(organisationNumbers: OrganisationNumber[]) => Promise<Organisation[]>} findByOrganisationNumbers - Find the organisations holding these numbers
 * @property {(id: string, minimumVersion?: number) => Promise<Organisation>} findById
 * @property {(accreditationNumber: AccreditationNumber) => Promise<boolean>} isAccreditationNumberInUse - Whether any accreditation in any organisation holds this number, regardless of the accreditation's status
 * @property {(registrationNumber: RegistrationNumber) => Promise<boolean>} isRegistrationNumberInUse - Whether any registration in any organisation holds this number, regardless of the registration's status
 * @property {(organisationId: string, registrationId: string, minimumOrgVersion?: number) => Promise<Registration>} findRegistrationById
 * @property {(organisationId: string, accreditationId: string, minimumOrgVersion?: number) => Promise<Accreditation>} findAccreditationById
 * @property {() => Promise<OrganisationIds>} findAllIds - Find all organisation, registration, and accreditation IDs
 * @property {(organisationNumber: OrganisationNumber, minimumVersion?: number) => Promise<Organisation|null>} findByOrganisationNumber - Find the organisation with this number. With `minimumVersion`, waits for that version to be readable, and throws 500 if it never is
 * @property {() => Promise<OrganisationNumber|null>} findHighestOrganisationNumber - The highest number any organisation holds, or null when there are no organisations
 * @property {(organisationNumber: OrganisationNumber) => Promise<number>} deleteByOrganisationNumber - Delete the organisation with this number, giving how many were deleted. Only the non-production data reset calls it
 * @property {(id: string, version: number, registrationId: string, entries: Record<string, {overseasSiteId: string}>) => Promise<boolean>} replaceRegistrationOverseasSites - Replace a registration's overseasSites map with the given entries
 */

export {} // NOSONAR: javascript:S7787 - Required to make this file a module for JSDoc @import
