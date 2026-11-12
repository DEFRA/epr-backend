/** @import { RequiredNumbers } from '#domain/organisations/numbers.js' */

/**
 * @param {RequiredNumbers} ledgerId
 * @returns {string}
 */
export const ledgerKey = ({
  organisationNumber,
  registrationNumber,
  accreditationNumber
}) =>
  JSON.stringify([organisationNumber, registrationNumber, accreditationNumber])
