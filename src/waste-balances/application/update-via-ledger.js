import { recordWasteBalanceUpdateAudit } from './audit.js'

/**
 * Apply a summary-log submission to the event-sourced ledger.
 *
 * Commits the submission's aggregate `creditTotal` — summed by the caller from
 * the row states the submission committed — through the injected
 * `commitSummaryLogSubmittedEvent`, which folds the ledger, decides the
 * submission event, and appends it. A competing write that
 * advanced the head since the fold surfaces as a slot conflict and propagates to
 * the caller (ADR-0036): the caller is the summary-log worker job, so the
 * conflict fails the job and the queue redelivers, recomputing against fresh
 * state.
 *
 * @param {Object} params
 * @param {import('../repository/ledger-schema.js').AccreditedLedgerId} params.ledgerId
 * @param {number} params.creditTotal
 * @param {import('./waste-balance-service.js').CommitSummaryLogSubmittedEvent} params.commitSummaryLogSubmittedEvent
 * @param {Object} [params.dependencies]
 * @param {import('#repositories/system-logs/port.js').SystemLogsRepository} [params.dependencies.systemLogsRepository]
 * @param {import('#domain/summary-logs/worker/port.js').SubmitUser} params.user
 * @param {string} params.summaryLogId
 */
export const performUpdateViaLedger = async ({
  ledgerId,
  creditTotal,
  commitSummaryLogSubmittedEvent,
  dependencies = {},
  user,
  summaryLogId
}) => {
  const [event] = await commitSummaryLogSubmittedEvent(
    ledgerId,
    { summaryLogId, creditTotal },
    {
      id: user.id,
      ...(user.name && { name: user.name }),
      email: user.email
    }
  )

  await recordWasteBalanceUpdateAudit({
    systemLogsRepository: dependencies.systemLogsRepository,
    accreditationId: ledgerId.accreditationId,
    amount: event.closingBalance.amount,
    availableAmount: event.closingBalance.availableAmount,
    events: [event],
    user
  })
}
