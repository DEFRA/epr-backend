/** @import {CollatedUser, StoredLinkedDefraOrganisation, Organisation} from '#domain/organisations/model.js' */
/** @import {OrganisationNumber} from '#domain/organisations/numbers.js' */

/**
 * An organisation as the lookups that only name it return it, without its
 * registrations, accreditations or users.
 * @typedef {Pick<Organisation, 'id' | 'organisationNumber' | 'status'> & {
 *   companyDetails: Pick<Organisation['companyDetails'], 'name'>
 * }} OrganisationSummary
 */

/**
 * An {@link OrganisationSummary} of an organisation linked to a Defra
 * organisation, with the link.
 * @typedef {OrganisationSummary & Required<Pick<Organisation, 'linkedDefraOrganisation'>>} LinkedOrganisationSummary
 */

/**
 * Linking organisations to Defra ID organisations and managing their users.
 * ADR 56 places this in the Manage Organisation service, apart from the
 * registration and accreditation context that owns the administration port.
 *
 * @typedef {Object} OrganisationLinkingRepository
 * @property {(organisationNumber: OrganisationNumber, version: number, linkedDefraOrganisation: StoredLinkedDefraOrganisation) => Promise<void>} linkDefraOrganisation - Link the organisation to a Defra organisation and make it active. Throws 409 when the stored version is not `version`
 * @property {(organisationNumber: OrganisationNumber, version: number) => Promise<void>} unlinkDefraOrganisation - Remove the organisation's link to a Defra organisation, leaving its status as it is. Throws 409 when the stored version is not `version`
 * @property {(organisationNumber: OrganisationNumber, version: number, users: CollatedUser[]) => Promise<void>} replaceUsers - Replace the organisation's users with `users`, which must be the full list. Throws 409 when the stored version is not `version`
 * @property {(defraOrgId: string) => Promise<LinkedOrganisationSummary|null>} findByLinkedDefraOrgId - Find organisation linked to a Defra organisation ID
 * @property {(filter?: { name?: string }) => Promise<LinkedOrganisationSummary[]>} findAllLinked - Find all organisations linked to a Defra organisation, optionally filtered by name
 * @property {(email: string) => Promise<OrganisationSummary[]>} findAllLinkableForUser - Find unlinked approved organisations where user is an initial user
 */

export {} // NOSONAR: javascript:S7787 - Required to make this file a module for JSDoc @import
