/**
 * @typedef {Object} OrganisationsRepository
 * @property {() => Promise<Object[]>} findAll
 * @property {(orgId: string) => Promise<Object | null>} findByOrgId
 */

/**
 * @typedef {() => OrganisationsRepository} OrganisationsRepositoryFactory
 */
