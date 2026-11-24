/** @import {Organisation} from '#domain/organisations/model.js' */
/** @import {Registration} from '#domain/organisations/registration.js' */
/** @import {OrganisationNumber} from '#domain/organisations/numbers.js' */

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
 * @property {(organisationNumbers: OrganisationNumber[]) => Promise<Organisation[]>} findByOrganisationNumbers - Find the organisations holding these numbers
 * @property {(id: string, minimumVersion?: number) => Promise<Organisation>} findById
 * @property {(organisationId: string, registrationId: string, minimumOrgVersion?: number) => Promise<Registration>} findRegistrationById
 * @property {() => Promise<OrganisationIds>} findAllIds - Find all organisation, registration, and accreditation IDs
 * @property {(organisationNumber: OrganisationNumber, minimumVersion?: number) => Promise<Organisation|null>} findByOrganisationNumber - Find the organisation with this number. With `minimumVersion`, waits for that version to be readable, and throws 500 if it never is
 * @property {() => Promise<OrganisationNumber|null>} findHighestOrganisationNumber - The highest number any organisation holds, or null when there are no organisations
 * @property {(organisationNumber: OrganisationNumber) => Promise<number>} deleteByOrganisationNumber - Delete the organisation with this number, giving how many were deleted. Only the non-production data reset calls it
 * @property {(id: string, version: number, registrationId: string, entries: Record<string, {overseasSiteId: string}>) => Promise<boolean>} replaceRegistrationOverseasSites - Replace a registration's overseasSites map with the given entries
 */

export {} // NOSONAR: javascript:S7787 - Required to make this file a module for JSDoc @import
