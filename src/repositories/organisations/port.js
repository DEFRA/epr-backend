/**
 * @typedef {Object} OrganisationsRepository
 * @property {(organisation: Object) => Promise<void>} insert
 * @property {(id: string, version: number, updates: Object) => Promise<void>} update
 * @property {() => Promise<Object[]>} findAll
 * @property {(id: string, expectedVersion?: number) => Promise<Object|null>} findById
 * @property {(organisationId: string, registrationId: string, expectedOrgVersion?: number) => Promise<Object|null>} findRegistrationById
 */

/**
 * @typedef {() => OrganisationsRepository} OrganisationsRepositoryFactory
 */
