/** @import {Registration} from '#domain/organisations/registration.js' */
/** @import {WasteBalanceLedgerId} from '#waste-balances/repository/ledger-schema.js' */
/** @import {SubmittedSummaryLog} from './validate-issue-logging.js' */

/**
 * The ledger identity a summary log's reads and writes pivot on: the
 * organisation and registration it belongs to, and the accreditation whose
 * stream the submit path appended to — the summary log's own accreditationId
 * when present, otherwise the registration's, or null in the registered-only
 * phase. Carries the full ancestor chain so a read pivots on the same stream
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
    summaryLog.accreditationId ?? registration?.accreditationId ?? null
})
