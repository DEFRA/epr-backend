/** @import {Accreditation} from '#domain/organisations/accreditation.js' */
/** @import {Organisation} from '#domain/organisations/model.js' */
/** @import {Registration} from '#domain/organisations/registration.js' */

/**
 * @typedef {{
 *  id: string
 * }} Id

/**
 * @typedef {Object} OrganisationIds
 * @property {Set<string>} organisations - Set of organisation IDs
 * @property {Set<string>} registrations - Set of registration IDs
 * @property {Set<string>} accreditations - Set of accreditation IDs
 */

/**
 * Organisation replacement payload with identity fields removed.
 * Identity (id, version) is passed as separate parameters to replace().
 * @typedef {Partial<Omit<Organisation, 'id'|'version'|'schemaVersion'|'status'|'statusHistory'>>} OrganisationReplacement
 */

/**
 * @typedef {Object} OrganisationsRepository
 * @property {(organisation: Organisation) => Promise<void>} insert
 * @property {(id: string, version: number, replacement: OrganisationReplacement) => Promise<void>} replace
 * @property {(id: string, version: number, document: Organisation) => Promise<void>} replaceRaw - Direct write bypassing status history management (dev/test only)
 * @property {() => Promise<Organisation[]>} findAll
 * @property {(ids: string[]) => Promise<Organisation[]>} findByIds - Find organisations by array of IDs
 * @property {(id: string, minimumVersion?: number) => Promise<Organisation|null>} findById
 * @property {(defraOrgId: string) => Promise<Organisation|null>} findByLinkedDefraOrgId - Find organisation linked to a Defra organisation ID
 * @property {(filter?: { name?: string }) => Promise<Organisation[]>} findAllLinked - Find all organisations linked to a Defra organisation, optionally filtered by name
 * @property {(email: string) => Promise<Organisation[]>} findAllLinkableForUser - Find unlinked approved organisations where user is an initial user
 * @property {(organisationId: string, registrationId: string, minimumOrgVersion?: number) => Promise<Registration|null>} findRegistrationById
 * @property {(organisationId: string, accreditationId: string, minimumOrgVersion?: number) => Promise<Accreditation>} findAccreditationById
 * @property {() => Promise<OrganisationIds>} findAllIds - Find all organisation, registration, and accreditation IDs
 * @property {(orgId: number) => Promise<Organisation|null>} findByOrgId - Find organisation by business orgId
 * @property {(id: string, version: number, registrationId: string, entries: Record<string, {overseasSiteId: string}>) => Promise<boolean>} replaceRegistrationOverseasSites - Replace a registration's overseasSites map with the given entries
 */

/**
 * @typedef {() => OrganisationsRepository} OrganisationsRepositoryFactory
 */

export {} // NOSONAR: javascript:S7787 - Required to make this file a module for JSDoc @import
