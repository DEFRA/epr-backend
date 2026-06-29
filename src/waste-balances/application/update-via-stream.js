/** @import {OverseasSitesContext} from '#domain/summary-logs/table-schemas/validation-pipeline.js' */

import { add, toNumber } from '#common/helpers/decimal-utils.js'

import { STREAM_EVENT_KIND } from '../repository/stream-schema.js'
import { appendToStream } from './append-to-stream.js'
import { recordWasteBalanceUpdateAudit } from './audit.js'
import { classifyWasteRecord, getTargetAmount } from './target-amount.js'

/**
 * Append the submission event at the head this submission read. A competing
 * write that advanced the head in between surfaces as a slot/sequence conflict
 * and propagates to the caller (ADR-0036). The caller is the summary-log worker
 * job, so the conflict fails the job and the queue redelivers, recomputing the
 * submission against fresh state.
 *
 * @param {import('../repository/stream-port.js').WasteBalanceStreamRepository} repository
 * @param {import('../repository/stream-schema.js').RegistrationOrAccreditationId} partition
 * @param {{ kind: import('../repository/stream-schema.js').StreamEventKind, payload: import('../repository/stream-schema.js').SummaryLogSubmittedPayload, createdBy: import('../repository/stream-schema.js').StreamUserSummary }} event
 */
const appendSummaryLog = async (
  repository,
  { registrationId, accreditationId, organisationId },
  event
) => {
  const latest = await repository.findLatestByPartition(
    registrationId,
    accreditationId
  )
  const expectedHead = latest ? latest.number : 0

  return appendToStream(
    {
      repository,
      registrationId,
      accreditationId,
      organisationId,
      expectedHead
    },
    event
  )
}

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

  const event = await appendSummaryLog(
    streamRepository,
    { registrationId, accreditationId: accreditation.id, organisationId },
    {
      kind: STREAM_EVENT_KIND.SUMMARY_LOG_SUBMITTED,
      payload: { summaryLogId, creditTotal },
      createdBy: {
        id: user.id,
        ...(user.name && { name: user.name }),
        email: user.email
      }
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
