/** @import {Registration} from '#domain/organisations/registration.js' */
/** @import {WasteBalanceLedgerId} from '#waste-balances/repository/ledger-schema.js' */
/** @import {SubmittedSummaryLog} from './validate-issue-logging.js' */

/**
 * The ledger identity a summary log's reads and writes pivot on: the
 * organisation and registration it belongs to, and the accreditation the
 * submit path appended to — the summary log's own accreditationId when it
 * carries one (including `null`, which means registered-only), otherwise (a
 * legacy summary log, from before this field existed) the registration's.
 * Carries the full ancestor chain so a read pivots on the same accreditation
 * the write appended to, dropping no id above it.
 *
 * @param {SubmittedSummaryLog} summaryLog
 * @param {Registration | undefined} registration
 * @returns {WasteBalanceLedgerId}
 */
export const ledgerIdFor = (summaryLog, registration) => ({
  organisationId: summaryLog.organisationId,
  registrationId: summaryLog.registrationId,
  accreditationId:
    summaryLog.accreditationId !== undefined
      ? summaryLog.accreditationId
      : (registration?.accreditationId ?? null)
})
