/**
 * The numbers the domain issues to an organisation, a registration and an
 * accreditation. Each is branded so that a database id, or another kind of
 * number, cannot be passed where one is expected.
 *
 * @typedef {number & { readonly __brand: 'OrganisationNumber' }} OrganisationNumber
 * @typedef {string & { readonly __brand: 'RegistrationNumber' }} RegistrationNumber
 * @typedef {string & { readonly __brand: 'AccreditationNumber' }} AccreditationNumber
 */

/**
 * @param {number | string} value - as stored, or as a route path carries it
 * @returns {OrganisationNumber}
 */
export const toOrganisationNumber = (value) =>
  /** @type {OrganisationNumber} */ (Number(value))

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
