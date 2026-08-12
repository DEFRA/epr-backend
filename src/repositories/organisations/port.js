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
 * @typedef {Object} OrganisationsOverseasSitesAdminListItem
 * @property {number} [orgId]
 * @property {Array<{
 *   material?: string,
 *   registrationNumber?: string,
 *   accreditationId?: string,
 *   accreditationNumber?: string,
 *   accreditation?: { accreditationNumber?: string | null } | null,
 *   overseasSites?: Record<string, { overseasSiteId: string }>
 * }>} [registrations]
 * @property {Array<{ id?: string, accreditationNumber?: string | null }>} [accreditations]
 */

/**
 * @typedef {Object} OrganisationsOverseasSitesAdminListPage
 * @property {Array<{
 *   orgId: number | null,
 *   registrationNumber: string | null,
 *   accreditationNumber: string | null,
 *   orsId: string,
 *   packagingWasteCategory: string | null,
 *   destinationCountry: string,
 *   overseasReprocessorName: string,
 *   addressLine1: string,
 *   addressLine2: string | null,
 *   cityOrTown: string,
 *   stateProvinceOrRegion: string | null,
 *   postcode: string | null,
 *   coordinates: string | null,
 *   validFrom: Date | null
 * }>} rows
 * @property {number} totalItems
 */

/**
 * Organisation replacement payload with identity fields removed.
 * Identity (id, version) is passed as separate parameters to replace().
 *
 * Organisation-level statusHistory is server-owned and is omitted here, but the
 * Registration and Accreditation item types carry their own statusHistory and
 * replace() honours it for an existing item whose status is unchanged
 * (PAE-1809 — admins correcting updatedAt dates).
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
 * @property {string} [orgId] - business orgId or the organisation's document id; unparseable values match nothing
 * @property {string} [registrationId] - exact match on registrations[].id
 * @property {string} [registrationNumber] - case-insensitive exact match on registrations[].registrationNumber
 * @property {string} [accreditationId] - exact match on accreditations[].id
 * @property {string} [accreditationNumber] - case-insensitive exact match on accreditations[].accreditationNumber
 */

/**
 * A {@link SearchCriteria} query plus the page of results to return it in.
 * @typedef {SearchCriteria & { page: number, pageSize: number }} FindParams
 */

/**
 * @typedef {{ page: number, pageSize: number, registrationNumber?: string }} FindPageForOverseasSitesAdminListParams
 */

/**
 * @typedef {Object} OrganisationsRepository
 * @property {(organisation: Omit<Organisation, 'status'>) => Promise<void>} insert
 * @property {(id: string, version: number, replacement: OrganisationReplacement) => Promise<void>} replace
 * @property {() => Promise<Organisation[]>} findAll
 * @property {(schemaVersion: number) => Promise<Organisation[]>} findAllBySchemaVersion - Find all organisations with a specific schema version
 * @property {(params: FindParams) => Promise<{ items: Organisation[], page: number, pageSize: number, totalItems: number, totalPages: number }>} find - Find organisations matching every criterion in SearchCriteria, ANDed together; results sorted alphabetically by name and returned a page at a time
 * @property {() => Promise<OrganisationsOverseasSitesAdminListItem[]>} [findAllForOverseasSitesAdminList] - Lightweight projection for ORS admin list endpoint
 * @property {(params: FindPageForOverseasSitesAdminListParams) => Promise<OrganisationsOverseasSitesAdminListPage>} [findPageForOverseasSitesAdminList] - Paginated ORS admin list query optimized for MongoDB-backed reads
 * @property {(ids: string[]) => Promise<Organisation[]>} findByIds - Find organisations by array of IDs
 * @property {(id: string, minimumVersion?: number) => Promise<Organisation>} findById
 * @property {(defraOrgId: string) => Promise<Organisation|null>} findByLinkedDefraOrgId - Find organisation linked to a Defra organisation ID
 * @property {(accreditationNumber: string) => Promise<Organisation|null>} findByAccreditationNumber - Find the organisation holding an accreditation with this number, regardless of the accreditation's status
 * @property {(registrationNumber: string) => Promise<Organisation|null>} findByRegistrationNumber - Find the organisation holding a registration with this number, regardless of the registration's status
 * @property {(filter?: { name?: string }) => Promise<Organisation[]>} findAllLinked - Find all organisations linked to a Defra organisation, optionally filtered by name
 * @property {(email: string) => Promise<Organisation[]>} findAllLinkableForUser - Find unlinked approved organisations where user is an initial user
 * @property {(organisationId: string, registrationId: string, minimumOrgVersion?: number) => Promise<Registration>} findRegistrationById
 * @property {(organisationId: string, accreditationId: string, minimumOrgVersion?: number) => Promise<Accreditation>} findAccreditationById
 * @property {() => Promise<OrganisationIds>} findAllIds - Find all organisation, registration, and accreditation IDs
 * @property {(orgId: number) => Promise<Organisation|null>} findByOrgId - Find organisation by business orgId
 * @property {(id: string, version: number, registrationId: string, entries: Record<string, {overseasSiteId: string}>) => Promise<boolean>} replaceRegistrationOverseasSites - Replace a registration's overseasSites map with the given entries
 */

/**
 * @typedef {() => OrganisationsRepository} OrganisationsRepositoryFactory
 */

export {} // NOSONAR: javascript:S7787 - Required to make this file a module for JSDoc @import
