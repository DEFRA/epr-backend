/** @import {Brand} from '#common/helpers/brand.js' */

/**
 * The numbers the domain issues to an organisation, a registration and an
 * accreditation. Each is branded so that a database id, or another kind of
 * number, cannot be passed where one is expected.
 *
 * @typedef {Brand<string, 'OrganisationNumber'>} OrganisationNumber
 * @typedef {Brand<string, 'RegistrationNumber'>} RegistrationNumber
 * @typedef {Brand<string, 'AccreditationNumber'>} AccreditationNumber
 */

export const ORGANISATION_NUMBER_PATTERN = /^[1-9]\d*$/

/**
 * @param {string} value
 * @returns {OrganisationNumber}
 */
export const toOrganisationNumber = (value) => {
  if (!ORGANISATION_NUMBER_PATTERN.test(value)) {
    throw new TypeError(`'${value}' is not an organisation number`)
  }
  return /** @type {OrganisationNumber} */ (value)
}

/**
 * @param {string} value
 * @returns {RegistrationNumber}
 */
export const toRegistrationNumber = (value) =>
  /** @type {RegistrationNumber} */ (value)

/**
 * @param {string} value
 * @returns {AccreditationNumber}
 */
export const toAccreditationNumber = (value) =>
  /** @type {AccreditationNumber} */ (value)

/**
 * The numbers stored beside an organisation id, a registration id and an
 * accreditation id. The accreditation number is `null` where the accreditation
 * id is `null`, and absent where no accreditation id was given.
 *
 * @typedef {{
 *   organisationNumber: OrganisationNumber,
 *   registrationNumber?: RegistrationNumber,
 *   accreditationNumber?: AccreditationNumber | null
 * }} Numbers
 */

/**
 * Every number stored beside a registration's ids and its accreditation's. A
 * registered-only registration's accreditation number is `null`.
 *
 * @typedef {{
 *   organisationNumber: OrganisationNumber,
 *   registrationNumber: RegistrationNumber,
 *   accreditationNumber: AccreditationNumber | null
 * }} RequiredNumbers
 */
