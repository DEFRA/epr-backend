/**
 * The numbers the domain issues to an organisation, a registration and an
 * accreditation. Each is branded so that a database id, or another kind of
 * number, cannot be passed where one is expected.
 *
 * @typedef {string & { readonly __brand: 'OrganisationNumber' }} OrganisationNumber
 * @typedef {string & { readonly __brand: 'RegistrationNumber' }} RegistrationNumber
 * @typedef {string & { readonly __brand: 'AccreditationNumber' }} AccreditationNumber
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
