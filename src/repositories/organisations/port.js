/**
 * @typedef {Object} OrganisationsRepository
 * @property {() => Promise<Object[]>} findAll
 */

/**
 * @typedef {(logger: import('#common/helpers/logging/logger.js').TypedLogger) => OrganisationsRepository} OrganisationsRepositoryFactory
 */
