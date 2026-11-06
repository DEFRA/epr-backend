/** @import { Year } from '#common/helpers/dates/year.js' */
/** @import { AccreditationCommon, Organisation } from '#organisation-read-model/domain/model.js' */
/** @import { OrganisationNumber, RegistrationNumber } from '#domain/organisations/numbers.js' */

/**
 * A registration's accreditation for a year the REEX database does not hold
 * accreditations for.
 *
 * @typedef {AccreditationCommon & {
 *   registrationNumber: RegistrationNumber
 *   year: Year
 * }} FutureAccreditation
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
 * @property {(organisationNumber: OrganisationNumber, minimumVersion?: number) => Promise<Organisation | null>} findByOrganisationNumber - With `minimumVersion`, waits for that version of the stored organisation to be readable, and throws 500 if it never is
 * @property {(params: FindParams) => Promise<OrganisationPage>} find - Organisations matching every criterion, sorted by name, a page at a time
 */

export {} // NOSONAR: javascript:S7787 - Required to make this file a module for JSDoc @import
