/** @import { Organisation } from '#organisation-read-model/domain/model.js' */
/** @import { OrganisationNumber } from '#domain/organisations/numbers.js' */

/**
 * Every criterion that carries a value narrows the results, and an empty
 * string counts as absent.
 *
 * @typedef {{
 *   search?: string
 *   organisationNumber?: string
 *   registrationNumber?: string
 *   accreditationNumber?: string
 *   page: number
 *   pageSize: number
 * }} FindParams
 */

/**
 * @typedef {{
 *   items: Organisation[]
 *   page: number
 *   pageSize: number
 *   totalItems: number
 *   totalPages: number
 * }} OrganisationPage
 */

/**
 * @typedef {Object} OrganisationReadRepository
 * @property {(organisationNumber: OrganisationNumber) => Promise<Organisation | null>} findByOrganisationNumber
 * @property {(params: FindParams) => Promise<OrganisationPage>} find - Organisations matching every criterion, sorted by name, a page at a time
 * @property {() => Promise<Organisation[]>} findAll
 */

export {} // NOSONAR: javascript:S7787 - Required to make this file a module for JSDoc @import
