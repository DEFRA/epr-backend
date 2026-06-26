/** @import {OverseasSitesContext} from '#domain/summary-logs/table-schemas/validation-pipeline.js' */

import { add, toNumber } from '#common/helpers/decimal-utils.js'

import { appendSummaryLogSubmittedEvent } from './append-summary-log-submitted-event.js'
import { recordWasteBalanceUpdateAudit } from './audit.js'
import { classifyWasteRecord, getTargetAmount } from './target-amount.js'

/**
 * Apply a summary-log submission to the event stream.
 *
 * Computes the aggregate `creditTotal` (sum of all row-level target amounts)
 * and appends a single `summary-log-submitted` event. The stream's delta
 * arithmetic (creditTotal minus previous creditTotal) replaces the per-row
 * delta reconciliation of the ADR-0031 ledger.
 *
 * @param {Object} params
 * @param {Array<import('#domain/waste-records/model.js').WasteRecord>} params.wasteRecords
 * @param {{ id: string, validFrom?: string, validTo?: string }} params.accreditation
 * @param {import('../repository/stream-port.js').WasteBalanceStreamRepository} params.streamRepository
 * @param {Object} [params.dependencies]
 * @param {import('#repositories/system-logs/port.js').SystemLogsRepository} [params.dependencies.systemLogsRepository]
 * @param {import('#domain/summary-logs/worker/port.js').SubmitUser} params.user
 * @param {OverseasSitesContext} params.overseasSites
 * @param {string} params.summaryLogId
 */
export const performUpdateViaStream = async ({
  wasteRecords,
  accreditation,
  streamRepository,
  dependencies = {},
  user,
  overseasSites,
  summaryLogId
}) => {
  if (wasteRecords.length === 0) {
    return
  }

  const registrationId = wasteRecords[0].registrationId
  const organisationId = wasteRecords[0].organisationId

  const classifiedRows = wasteRecords.map((record) =>
    classifyWasteRecord(record, accreditation, overseasSites)
  )

  let creditTotal = 0
  for (const { classification } of classifiedRows) {
    creditTotal = toNumber(add(creditTotal, getTargetAmount(classification)))
  }

  const event = await appendSummaryLogSubmittedEvent({
    repository: streamRepository,
    registrationId,
    accreditationId: accreditation.id,
    organisationId,
    summaryLogId,
    creditTotal,
    createdBy: {
      id: user.id,
      ...(user.name && { name: user.name }),
      email: user.email
    }
  })

  await recordWasteBalanceUpdateAudit({
    systemLogsRepository: dependencies.systemLogsRepository,
    accreditationId: accreditation.id,
    amount: event.closingBalance.amount,
    availableAmount: event.closingBalance.availableAmount,
    newTransactions: [event],
    user
  })
}
