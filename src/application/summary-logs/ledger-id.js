/** @import {WasteBalanceLedgerId} from '#waste-balances/repository/ledger-schema.js' */

/**
 * The ledger a summary log's reads pivot on: its organisation, registration
 * and accreditation numbers, `null` meaning registered-only, and its year.
 *
 * @param {WasteBalanceLedgerId} summaryLog
 * @returns {WasteBalanceLedgerId}
 */
export const ledgerIdFor = ({
  organisationNumber,
  registrationNumber,
  accreditationNumber,
  year
}) => ({ organisationNumber, registrationNumber, accreditationNumber, year })
