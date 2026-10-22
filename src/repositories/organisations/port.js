/** @import {Accreditation} from '#domain/organisations/accreditation.js' */
/** @import {CollatedUser, LinkedDefraOrganisation, Organisation} from '#domain/organisations/model.js' */
/** @import {Registration} from '#domain/organisations/registration.js' */
/** @import {AccreditationNumber, OrganisationNumber, RegistrationNumber} from '#domain/organisations/numbers.js' */

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
 * An organisation as the lookups that only name it return it, without its
 * registrations, accreditations or users.
 * @typedef {Pick<Organisation, 'id' | 'orgId' | 'status'> & {
 *   companyDetails: Pick<Organisation['companyDetails'], 'name'>
 * }} OrganisationSummary
 */

/**
 * An {@link OrganisationSummary} of an organisation linked to a Defra
 * organisation, with the link.
 * @typedef {OrganisationSummary & Required<Pick<Organisation, 'linkedDefraOrganisation'>>} LinkedOrganisationSummary
 */

/**
 * @typedef {Object} OrganisationsRepository
 * @property {(organisation: Omit<Organisation, 'status'>) => Promise<void>} insert
 * @property {(id: string, version: number, replacement: OrganisationReplacement) => Promise<void>} replace
 * @property {(organisationNumber: OrganisationNumber, version: number, linkedDefraOrganisation: LinkedDefraOrganisation) => Promise<void>} linkDefraOrganisation - Link the organisation to a Defra organisation and make it active. Throws 409 when the stored version is not `version`
 * @property {(organisationNumber: OrganisationNumber, version: number) => Promise<void>} unlinkDefraOrganisation - Remove the organisation's link to a Defra organisation, leaving its status as it is. Throws 409 when the stored version is not `version`
 * @property {(organisationNumber: OrganisationNumber, version: number, users: CollatedUser[]) => Promise<void>} replaceUsers - Replace the organisation's users, keeping the submitters, approved persons and signatories its records name. Throws 409 when the stored version is not `version`
 * @property {() => Promise<Organisation[]>} findAll
 * @property {(params: FindParams) => Promise<{ items: Organisation[], page: number, pageSize: number, totalItems: number, totalPages: number }>} find - Find organisations matching every criterion in SearchCriteria, ANDed together; results sorted alphabetically by name and returned a page at a time
 * @property {(ids: string[]) => Promise<Organisation[]>} findByIds - Find organisations by array of IDs
 * @property {(id: string, minimumVersion?: number) => Promise<Organisation>} findById
 * @property {(defraOrgId: string) => Promise<LinkedOrganisationSummary|null>} findByLinkedDefraOrgId - Find organisation linked to a Defra organisation ID
 * @property {(accreditationNumber: AccreditationNumber) => Promise<boolean>} isAccreditationNumberInUse - Whether any accreditation in any organisation holds this number, regardless of the accreditation's status
 * @property {(registrationNumber: RegistrationNumber) => Promise<boolean>} isRegistrationNumberInUse - Whether any registration in any organisation holds this number, regardless of the registration's status
 * @property {(filter?: { name?: string }) => Promise<LinkedOrganisationSummary[]>} findAllLinked - Find all organisations linked to a Defra organisation, optionally filtered by name
 * @property {(email: string) => Promise<OrganisationSummary[]>} findAllLinkableForUser - Find unlinked approved organisations where user is an initial user
 * @property {(organisationId: string, registrationId: string, minimumOrgVersion?: number) => Promise<Registration>} findRegistrationById
 * @property {(organisationId: string, accreditationId: string, minimumOrgVersion?: number) => Promise<Accreditation>} findAccreditationById
 * @property {() => Promise<OrganisationIds>} findAllIds - Find all organisation, registration, and accreditation IDs
 * @property {(organisationNumber: OrganisationNumber) => Promise<Organisation|null>} findByOrganisationNumber - Find the organisation with this number
 * @property {(id: string, version: number, registrationId: string, entries: Record<string, {overseasSiteId: string}>) => Promise<boolean>} replaceRegistrationOverseasSites - Replace a registration's overseasSites map with the given entries
 */

/**
 * @typedef {() => OrganisationsRepository} OrganisationsRepositoryFactory
 */

export {} // NOSONAR: javascript:S7787 - Required to make this file a module for JSDoc @import
