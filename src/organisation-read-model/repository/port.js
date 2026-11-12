/** @import { Organisation } from '#organisation-read-model/domain/model.js' */
/** @import { OrganisationNumber } from '#domain/organisations/numbers.js' */
/** @import { Year } from '#common/helpers/dates/year.js' */

/**
 * Without `year`, every year is given. With it, the organisation as it stood
 * in that year: only registrations approved at some point in it, each with
 * only that year's accreditation and standing, and statuses as they stood at
 * the end of the year, or today if the year has not yet ended.
 *
 * @typedef {{
 *   year?: Year
 * }} FindByOrganisationNumberOptions
 */

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
 * @property {(organisationNumber: OrganisationNumber, options?: FindByOrganisationNumberOptions) => Promise<Organisation | null>} findByOrganisationNumber
 * @property {(params: FindParams) => Promise<OrganisationPage>} find - Organisations matching every criterion, sorted by name, a page at a time
 * @property {() => Promise<Organisation[]>} findAll - Every organisation the model serves
 */

export {} // NOSONAR: javascript:S7787 - Required to make this file a module for JSDoc @import
