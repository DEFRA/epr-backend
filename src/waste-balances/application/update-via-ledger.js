/**
 * @import {SummaryLogFileId} from '#domain/summary-logs/ids.js'
 * @import {SummaryLogSubmittedTotals} from '#waste-balances/repository/ledger-schema.js'
 */

import { recordWasteBalanceUpdateAudit } from './audit.js'
import { toLedgerUser } from './ledger-user.js'

/**
 * Apply a summary-log submission's totals to the event-sourced ledger through
 * the injected `commitSummaryLogSubmittedEvent`, which folds the ledger,
 * decides the submission event, and appends it. A competing write that
 * advanced the head since the fold surfaces as a slot conflict and propagates to
 * the caller (ADR-0036): the caller is the summary-log worker job, so the
 * conflict fails the job and the queue redelivers, deciding against fresh
 * state.
 *
 * @param {Object} params
 * @param {SummaryLogSubmittedTotals} params.totals
 * @param {import('./waste-balance-service.js').CommitSummaryLogSubmittedEvent} params.commitSummaryLogSubmittedEvent
 * @param {Object} [params.dependencies]
 * @param {import('#system-logs/index.js').SystemLogsRepository} [params.dependencies.systemLogsRepository]
 * @param {import('#domain/summary-logs/worker/port.js').SubmitUser} params.user
 * @param {SummaryLogFileId} params.summaryLogId
 * @param {import('#waste-balances/repository/ledger-schema.js').WasteBalanceLedgerId} params.ledgerId
 */
export const performUpdateViaLedger = async ({
  totals,
  commitSummaryLogSubmittedEvent,
  dependencies = {},
  user,
  summaryLogId,
  ledgerId
}) => {
  const [event] = await commitSummaryLogSubmittedEvent(
    ledgerId,
    { summaryLogId, ...totals },
    toLedgerUser(user)
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
