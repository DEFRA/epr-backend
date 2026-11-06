/** @import {AccreditationNumber} from '#domain/organisations/numbers.js' */
/** @import {Registration} from '#domain/organisations/registration.js' */
/** @import {WasteBalanceLedgerId} from '#waste-balances/repository/ledger-schema.js' */
/** @import {SubmittedSummaryLog} from './validate-issue-logging.js' */

/**
 * The ledger a summary log's reads pivot on: its organisation and registration,
 * and the accreditation the submit path appended to — the summary log's own
 * when it names one (`null` meaning registered-only), otherwise (a legacy
 * summary log, from before this field existed) the registration's.
 *
 * @param {SubmittedSummaryLog} summaryLog
 * @param {Registration | undefined} registration
 * @returns {WasteBalanceLedgerId}
 */
export const ledgerIdFor = (summaryLog, registration) => ({
  organisationNumber: summaryLog.organisationNumber,
  registrationNumber: summaryLog.registrationNumber,
  accreditationNumber:
    summaryLog.accreditationId !== undefined
      ? // The schema stores a number beside every accreditation id.
        /** @type {AccreditationNumber | null} */ (
          summaryLog.accreditationNumber
        )
      : (registration?.accreditation?.accreditationNumber ?? null)
})
