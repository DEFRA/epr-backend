/** @import { Organisation } from '#organisation-read-model/domain/model.js' */
/** @import { OrganisationNumber } from '#domain/organisations/numbers.js' */
/** @import { FindParams } from '#repositories/organisations/port.js' */

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
 */

export {} // NOSONAR: javascript:S7787 - Required to make this file a module for JSDoc @import
