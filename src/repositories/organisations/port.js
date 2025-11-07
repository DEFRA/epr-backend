/**
 * @typedef {Object} OrganisationsRepository
 * @property {(organisation: Object) => Promise<void>} insert
 * @property {(id: string, version: number, updates: Object) => Promise<void>} update
 * @property {(organisation: Object) => Promise<{action: 'inserted'|'updated'|'unchanged', id: string}>} upsert
 * @property {() => Promise<Object[]>} findAll
 * @property {(id: string, minimumVersion?: number) => Promise<Object|null>} findById
 * @property {(organisationId: string, registrationId: string, minimumOrgVersion?: number) => Promise<Object|null>} findRegistrationById
 */

/**
 * @typedef {() => OrganisationsRepository} OrganisationsRepositoryFactory
 */
