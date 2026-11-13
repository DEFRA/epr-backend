/**
 * The key joining a registration's reports to it.
 *
 * @param {{ organisationNumber: string, registrationNumber?: string | null }} numbers
 * @returns {string}
 */
export const registrationKey = ({ organisationNumber, registrationNumber }) =>
  `${organisationNumber}::${registrationNumber}`
