/** @import {OverseasSitesContext} from '#domain/summary-logs/table-schemas/validation-pipeline.js' */

import { add, toNumber } from '#common/helpers/decimal-utils.js'

import { STREAM_EVENT_KIND } from '../repository/stream-schema.js'
import { appendToStream } from './append-to-stream.js'
import { recordWasteBalanceUpdateAudit } from './audit.js'
import { getTargetAmount } from './target-amount.js'

/**
 * Apply a summary-log submission to the event stream.
 *
 * Computes the aggregate `creditTotal` (sum of all row-level target
 * amounts), then appends a single `summary-log-submitted` event. The
 * stream's delta arithmetic (creditTotal minus previous creditTotal)
 * replaces the per-row delta reconciliation of the ADR-0031 ledger.
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

  const organisationId = wasteRecords[0].organisationId
  const registrationId = wasteRecords[0].registrationId

  let creditTotal = 0
  for (const record of wasteRecords) {
    creditTotal = toNumber(
      add(creditTotal, getTargetAmount(record, accreditation, overseasSites))
    )
  }

  const event = await appendToStream(
    {
      repository: streamRepository,
      registrationId,
      accreditationId: accreditation.id,
      organisationId
    },
    {
      kind: STREAM_EVENT_KIND.SUMMARY_LOG_SUBMITTED,
      payload: { summaryLogId, creditTotal },
      createdBy: { id: user.id, name: user.email }
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
