import { add, toNumber } from '#common/helpers/decimal-utils.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import { getTargetAmount } from '#waste-balances/application/target-amount.js'

import { writeSummaryLogRowStates } from './write-summary-log-row-states.js'

/**
 * @import { OverseasSitesContext } from '#domain/summary-logs/table-schemas/validation-pipeline.js'
 * @import { SummaryLogRowStateEntry } from '#waste-records/repository/schema.js'
 * @import { createWasteBalanceService } from '#waste-balances/application/waste-balance-service.js'
 */

/**
 * Processing types whose templates carry loads the waste balance reads. The
 * registered-only variants report activity without an accreditation behind it,
 * so they move no tonnage.
 *
 * @type {Set<import('#domain/summary-logs/meta-fields.js').ProcessingType>}
 */
const BALANCE_BEARING_PROCESSING_TYPES = new Set([
  PROCESSING_TYPES.EXPORTER,
  PROCESSING_TYPES.REPROCESSOR_INPUT,
  PROCESSING_TYPES.REPROCESSOR_OUTPUT
])

/**
 * The tonnage a set of committed row states credits to the balance: the sum of
 * every included row's contribution, added at full decimal precision.
 *
 * @param {SummaryLogRowStateEntry[]} rowStates
 * @returns {number}
 */
const creditTotalOf = (rowStates) =>
  rowStates.reduce(
    (total, { classification }) =>
      toNumber(add(total, getTargetAmount(classification))),
    0
  )

/**
 * Commits a summary-log submission: the per-row state that is the submission's
 * committed contents, and the ledger event recording that it was submitted.
 *
 * The rows are classified once, when their states are built. The credit the
 * ledger event carries is then summed from those same states, so the balance
 * and the committed contents can never disagree about which rows counted.
 *
 * Which submissions carry a balance is decided here rather than by the caller:
 * a submission with no accreditation records a zero-delta event under the
 * registered-only ledger, an accredited submission on a balance-bearing
 * template credits its total, and an accredited submission that is either
 * registered-only or has no rows at all appends nothing.
 *
 * @param {Object} params
 * @param {import('#waste-records/repository/port.js').SummaryLogRowStateRepository} params.summaryLogRowStateRepository
 * @param {ReturnType<typeof createWasteBalanceService>} params.wasteBalanceService
 * @param {import('#domain/waste-records/model.js').WasteRecord[]} params.wasteRecords
 * @param {import('#domain/organisations/accreditation.js').Accreditation | null} params.accreditation
 * @param {import('#waste-records/repository/schema.js').WasteBalanceLedgerId} params.ledgerId
 * @param {import('#domain/summary-logs/meta-fields.js').ProcessingType} params.processingType
 * @param {OverseasSitesContext} params.overseasSites
 * @param {string} params.summaryLogId
 * @param {import('#domain/summary-logs/worker/port.js').SubmitUser} params.user
 * @returns {Promise<void>}
 */
export const commitSummaryLogSubmission = async ({
  summaryLogRowStateRepository,
  wasteBalanceService,
  wasteRecords,
  accreditation,
  ledgerId,
  processingType,
  overseasSites,
  summaryLogId,
  user
}) => {
  const rowStates = await writeSummaryLogRowStates({
    summaryLogRowStateRepository,
    wasteRecords,
    accreditation,
    ledgerId,
    overseasSites,
    summaryLogId
  })

  // The accreditation is what makes a ledger able to hold a balance, so the
  // accredited identity is derived from it rather than tested for separately.
  const accreditedLedgerId = accreditation
    ? { ...ledgerId, accreditationId: accreditation.id }
    : null

  if (!accreditedLedgerId) {
    await wasteBalanceService.commitSummaryLogSubmittedEvent(
      ledgerId,
      { summaryLogId, creditTotal: 0 },
      {
        id: user.id,
        ...(user.name && { name: user.name }),
        email: user.email
      }
    )
    return
  }

  if (
    !BALANCE_BEARING_PROCESSING_TYPES.has(processingType) ||
    rowStates.length === 0
  ) {
    return
  }

  await wasteBalanceService.submitSummaryLog({
    ledgerId: accreditedLedgerId,
    creditTotal: creditTotalOf(rowStates),
    summaryLogId,
    user
  })
}
