/** @import {OverseasSitesContext} from '#domain/summary-logs/table-schemas/validation-pipeline.js' */

import { add, toNumber } from '#common/helpers/decimal-utils.js'

import { STREAM_EVENT_KIND } from '../repository/stream-schema.js'
import { appendToStream } from './append-to-stream.js'
import { recordWasteBalanceUpdateAudit } from './audit.js'
import { classifyWasteRecord, getTargetAmount } from './target-amount.js'

/**
 * Apply a summary-log submission to the event stream.
 *
 * When the committed-row-states feature flag is enabled, persists each row's
 * committed state first (idempotent upsert keyed by row identity, coerced data
 * and classification, `$addToSet`ing this submission's `summaryLogId` onto
 * membership). Either way computes the aggregate `creditTotal` (sum of all
 * row-level target amounts) and appends a single `summary-log-submitted` event.
 * The row-state write precedes the event append so a failed append leaves no
 * committed balance change and the partially written row states stay invisible
 * to committed reads until a retry commits them. With the flag off, no
 * row-state write occurs and the submission behaves exactly as before. The
 * stream's delta arithmetic (creditTotal minus previous creditTotal) replaces
 * the per-row delta reconciliation of the ADR-0031 ledger.
 *
 * @param {Object} params
 * @param {Array<import('#domain/waste-records/model.js').WasteRecord>} params.wasteRecords
 * @param {{ id: string, validFrom?: string, validTo?: string }} params.accreditation
 * @param {import('../repository/stream-port.js').WasteBalanceStreamRepository} params.streamRepository
 * @param {import('../repository/row-states-port.js').RowStateRepository} params.rowStateRepository
 * @param {Object} [params.dependencies]
 * @param {import('#repositories/system-logs/port.js').SystemLogsRepository} [params.dependencies.systemLogsRepository]
 * @param {import('#feature-flags/feature-flags.port.js').FeatureFlags} [params.dependencies.featureFlags]
 * @param {import('#domain/summary-logs/worker/port.js').SubmitUser} params.user
 * @param {OverseasSitesContext} params.overseasSites
 * @param {string} params.summaryLogId
 */
export const performUpdateViaStream = async ({
  wasteRecords,
  accreditation,
  streamRepository,
  rowStateRepository,
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

  const classifiedRows = wasteRecords.map((record) =>
    classifyWasteRecord(record, accreditation, overseasSites)
  )

  if (dependencies.featureFlags?.isCommittedRowStatesEnabled()) {
    await rowStateRepository.upsertRowStates(
      { organisationId, registrationId, accreditationId: accreditation.id },
      classifiedRows,
      summaryLogId
    )
  }

  let creditTotal = 0
  for (const { classification } of classifiedRows) {
    creditTotal = toNumber(add(creditTotal, getTargetAmount(classification)))
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
