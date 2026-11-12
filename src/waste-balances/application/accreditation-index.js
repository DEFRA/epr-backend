/**
 * @typedef {import('#waste-balances/repository/ledger-schema.js').WasteBalanceLedgerId} WasteBalanceLedgerId
 */

/**
 * @param {WasteBalanceLedgerId} ledgerId
 * @returns {string}
 */
export const ledgerKey = ({
  organisationNumber,
  registrationNumber,
  accreditationNumber,
  year
}) =>
  JSON.stringify([
    organisationNumber,
    registrationNumber,
    accreditationNumber,
    year
  ])
