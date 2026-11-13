/**
 * @import {AccreditationValidity} from '#domain/organisations/accreditation.js'
 * @import {SummaryLogFileId} from '#domain/summary-logs/ids.js'
 * @import {TableSchema} from '#domain/summary-logs/table-schemas/index.js'
 * @import {OverseasSitesContext} from '#domain/summary-logs/table-schemas/validation-pipeline.js'
 * @import {WasteRecord} from '#domain/waste-records/model.js'
 */

import { add, toNumber } from '#common/helpers/decimal-utils.js'

import { recordWasteBalanceUpdateAudit } from './audit.js'
import { decemberCreditTotalFor } from './december-credit-total.js'
import { classifyWasteRecord, getTargetAmount } from './target-amount.js'

/**
 * Apply a summary-log submission to the event-sourced ledger.
 *
 * Computes the aggregate `creditTotal` (sum of all row-level target amounts)
 * and commits it through the injected `commitSummaryLogSubmittedEvent`, which
 * folds the ledger, decides the submission event, and appends it. A competing
 * write that
 * advanced the head since the fold surfaces as a slot conflict and propagates to
 * the caller (ADR-0036): the caller is the summary-log worker job, so the
 * conflict fails the job and the queue redelivers, recomputing against fresh
 * state.
 *
 * @param {Object} params
 * @param {Array<WasteRecord>} params.wasteRecords
 * @param {AccreditationValidity} params.accreditation
 * @param {import('./waste-balance-service.js').CommitSummaryLogSubmittedEvent} params.commitSummaryLogSubmittedEvent
 * @param {Object} [params.dependencies]
 * @param {import('#repositories/system-logs/port.js').SystemLogsRepository} [params.dependencies.systemLogsRepository]
 * @param {import('#domain/summary-logs/worker/port.js').SubmitUser} params.user
 * @param {OverseasSitesContext} params.overseasSites
 * @param {SummaryLogFileId} params.summaryLogId
 * @param {import('#waste-balances/repository/ledger-schema.js').WasteBalanceLedgerId} params.ledgerId
 * @param {Record<string, TableSchema>} params.tableSchemas - The table schemas of the summary log's template
 */
export const performUpdateViaLedger = async ({
  wasteRecords,
  accreditation,
  commitSummaryLogSubmittedEvent,
  dependencies = {},
  user,
  overseasSites,
  summaryLogId,
  ledgerId,
  tableSchemas
}) => {
  if (wasteRecords.length === 0) {
    return
  }

  const classifiedRows = wasteRecords.map((record) =>
    classifyWasteRecord(record, tableSchemas, accreditation, overseasSites)
  )

  let creditTotal = 0
  for (const { classification } of classifiedRows) {
    creditTotal = toNumber(add(creditTotal, getTargetAmount(classification)))
  }

  const decemberCreditTotal = decemberCreditTotalFor(
    classifiedRows,
    accreditation
  )

  const [event] = await commitSummaryLogSubmittedEvent(
    ledgerId,
    { summaryLogId, creditTotal, decemberCreditTotal },
    {
      id: user.id,
      ...(user.name && { name: user.name }),
      email: user.email
    }
  )

  await recordWasteBalanceUpdateAudit({
    systemLogsRepository: dependencies.systemLogsRepository,
    ledgerId,
    amount: event.closingBalance.amount,
    availableAmount: event.closingBalance.availableAmount,
    events: [event],
    user
  })
}
