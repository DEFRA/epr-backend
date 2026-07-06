/** @import {OverseasSitesContext} from '#domain/summary-logs/table-schemas/validation-pipeline.js' */

import { add, toNumber } from '#common/helpers/decimal-utils.js'

import { recordWasteBalanceUpdateAudit } from './audit.js'
import { classifyWasteRecord, getTargetAmount } from './target-amount.js'

/**
 * Apply a summary-log submission to the event-sourced ledger.
 *
 * Computes the aggregate `creditTotal` (sum of all row-level target amounts)
 * and submits it through the injected `submitSummaryLog`, which folds the
 * ledger, decides the submission event, and appends it. A competing write that
 * advanced the head since the fold surfaces as a slot conflict and propagates to
 * the caller (ADR-0036): the caller is the summary-log worker job, so the
 * conflict fails the job and the queue redelivers, recomputing against fresh
 * state.
 *
 * @param {Object} params
 * @param {Array<import('#domain/waste-records/model.js').WasteRecord>} params.wasteRecords
 * @param {{ id: string, validFrom?: string, validTo?: string }} params.accreditation
 * @param {import('./waste-balance-service.js').SubmitSummaryLog} params.submitSummaryLog
 * @param {Object} [params.dependencies]
 * @param {import('#repositories/system-logs/port.js').SystemLogsRepository} [params.dependencies.systemLogsRepository]
 * @param {import('#domain/summary-logs/worker/port.js').SubmitUser} params.user
 * @param {OverseasSitesContext} params.overseasSites
 * @param {string} params.summaryLogId
 */
export const performUpdateViaLedger = async ({
  wasteRecords,
  accreditation,
  submitSummaryLog,
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

  const [event] = await submitSummaryLog(
    { registrationId, accreditationId: accreditation.id, organisationId },
    { summaryLogId, creditTotal },
    {
      id: user.id,
      ...(user.name && { name: user.name }),
      email: user.email
    }
  )

  await recordWasteBalanceUpdateAudit({
    systemLogsRepository: dependencies.systemLogsRepository,
    accreditationId: accreditation.id,
    amount: event.closingBalance.amount,
    availableAmount: event.closingBalance.availableAmount,
    newTransactions: [event],
    user
  })
}
