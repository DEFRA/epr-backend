/** @import {WasteBalanceLedgerId} from '#waste-balances/repository/ledger-schema.js' */
/** @import {SubmittedSummaryLog} from './validate-issue-logging.js' */

/**
 * The ledger a summary log's reads pivot on: its organisation, registration
 * and accreditation numbers, `null` meaning registered-only.
 *
 * @param {SubmittedSummaryLog} summaryLog
 * @returns {WasteBalanceLedgerId}
 */
export const ledgerIdFor = ({
  organisationNumber,
  registrationNumber,
  accreditationNumber
}) => ({ organisationNumber, registrationNumber, accreditationNumber })
