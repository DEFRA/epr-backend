/** @import { OrganisationNumber, RegistrationNumber } from '#domain/organisations/numbers.js' */

/**
 * The key joining a registration's reports to it.
 *
 * @param {{ organisationNumber: OrganisationNumber, registrationNumber?: RegistrationNumber | null }} numbers
 * @returns {string}
 */
export const registrationKey = ({ organisationNumber, registrationNumber }) =>
  `${organisationNumber}::${registrationNumber}`
