import { appendRegisteredOnlySubmittedEvent } from '#waste-balances/application/append-registered-only-submitted-event.js'
import {
  BACKFILL_ACTOR,
  STREAM_EVENT_KIND
} from '#waste-balances/repository/stream-schema.js'

import { reconstructSubmissionRowStates } from './reconstruct-submission-rowstates.js'

/**
 * @import { RowStatePartition } from '#waste-records/repository/schema.js'
 * @import { RowStateRepository } from '#waste-records/repository/port.js'
 * @import { WasteRecord } from '#domain/waste-records/model.js'
 * @import { OrderedSummaryLog } from './reconstruct-submission-rowstates.js'
 * @import { WasteBalanceStreamRepository } from '#waste-balances/repository/stream-port.js'
 */

/**
 * What a single registration's backfill wrote, for migration logging.
 *
 * @typedef {Object} RegistrationBackfillSummary
 * @property {number} submissionCount - Submitted summary logs replayed
 * @property {number} rowStateWriteCount - Row-state entries upserted across them
 * @property {number} submittedEventWriteCount - Registered-only summary-log submitted events emitted
 */

/**
 * The summary-log ids of registered-only summary-log submitted events already present in a
 * null-accreditation partition, so a re-run never double-emits an event.
 *
 * @param {WasteBalanceStreamRepository} streamRepository
 * @param {string} registrationId
 * @returns {Promise<Set<string>>}
 */
const existingSubmittedEventSummaryLogIds = async (
  streamRepository,
  registrationId
) => {
  const events = await streamRepository.findAllByPartition(registrationId, null)
  return new Set(
    events
      .filter((event) => event.kind === STREAM_EVENT_KIND.SUMMARY_LOG_SUBMITTED)
      .map(
        (event) =>
          /** @type {import('#waste-balances/repository/stream-schema.js').SummaryLogSubmittedPayload} */ (
            event.payload
          ).summaryLogId
      )
  )
}

/**
 * Backfill one registration's waste record states from its sparse version
 * history. Reconstructs each historical submission's membership in stream order
 * and upserts it through the guarded `upsertRowStates`, so a row unchanged
 * across submissions dedups to one document whose membership grows. Re-runnable:
 * the upsert is idempotent, so a second pass writes nothing new.
 *
 * Submissions are upserted sequentially, not concurrently: membership growth
 * depends on an earlier submission's document already existing when a later one
 * that shares its state is written.
 *
 * Registered-only registrations (null partition) form no summary-log submitted
 * event on the live path, so the same sweep emits a zero-delta
 * `summary-log-submitted` event per submission, in stream order, so every
 * submission has its submitted event. Emission is balance-neutral and
 * idempotent: an event is skipped when one already exists for its summary log,
 * so a re-run emits none. Accredited partitions keep the events their original
 * processing wrote and emit none here.
 *
 * @param {Object} params
 * @param {RowStatePartition} params.partition
 * @param {WasteRecord[]} params.wasteRecords
 * @param {OrderedSummaryLog[]} params.summaryLogs
 * @param {Object} params.accreditation
 * @param {import('#domain/summary-logs/table-schemas/validation-pipeline.js').OverseasSitesContext} params.overseasSites
 * @param {RowStateRepository} params.rowStateRepository
 * @param {WasteBalanceStreamRepository} params.streamRepository
 * @returns {Promise<RegistrationBackfillSummary>}
 */
export const backfillRegistrationRowStates = async ({
  partition,
  wasteRecords,
  summaryLogs,
  accreditation,
  overseasSites,
  rowStateRepository,
  streamRepository
}) => {
  const submissions = reconstructSubmissionRowStates({
    wasteRecords,
    summaryLogs,
    accreditation,
    overseasSites
  })

  const emitsSubmittedEvents = partition.accreditationId === null
  const existingSubmittedEvents = emitsSubmittedEvents
    ? await existingSubmittedEventSummaryLogIds(
        streamRepository,
        partition.registrationId
      )
    : new Set()

  let rowStateWriteCount = 0
  let submittedEventWriteCount = 0
  for (const { summaryLogId, entries } of submissions) {
    await rowStateRepository.upsertRowStates(partition, entries, summaryLogId)
    rowStateWriteCount += entries.length

    if (emitsSubmittedEvents && !existingSubmittedEvents.has(summaryLogId)) {
      await appendRegisteredOnlySubmittedEvent({
        repository: streamRepository,
        registrationId: partition.registrationId,
        organisationId: partition.organisationId,
        summaryLogId,
        createdBy: BACKFILL_ACTOR
      })
      existingSubmittedEvents.add(summaryLogId)
      submittedEventWriteCount += 1
    }
  }

  return {
    submissionCount: submissions.length,
    rowStateWriteCount,
    submittedEventWriteCount
  }
}
