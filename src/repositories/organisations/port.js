/**
 * @typedef {Object} OrganisationsRepository
 * @property {(organisation: Object) => Promise<void>} insert
 * @property {() => Promise<Object[]>} findAll
 * @property {(id: string) => Promise<Object|null>} findById
 * @property {(organisationId: string, registrationId: string) => Promise<Object|null>} findRegistrationById
 */

/**
 * @typedef {() => OrganisationsRepository} OrganisationsRepositoryFactory
 */
