import { STREAM_EVENT_KIND } from '../repository/stream-schema.js'
import { latestCommittedSummaryLogId } from './latest-committed-summary-log-id.js'

/**
 * @typedef {import('../repository/row-states-schema.js').RowState} RowState
 */

/**
 * @typedef {import('../repository/row-states-schema.js').RowClassification} RowClassification
 */

/**
 * One submission's appearance of a row in its history. Content-match dedup
 * means a single state document can carry several submissions in its
 * membership (a row reverting A->B->A reuses the earlier A document), so each
 * membership entry expands into its own occurrence — what the row said in that
 * submission, and whether and why it counted.
 *
 * @typedef {Object} RowHistoryEntry
 * @property {string} summaryLogId
 * @property {number} streamPosition
 * @property {Record<string, any>} data
 * @property {RowClassification} classification
 */

/**
 * Membership query for a resolved committed head: every row whose committed
 * state belongs to that submission, or nothing when there is no head.
 *
 * @param {import('../repository/row-states-port.js').RowStateRepository} rowStateRepository
 * @param {string | null} head
 * @returns {Promise<RowState[]>}
 */
const rowStatesForHead = async (rowStateRepository, head) =>
  head === null ? [] : rowStateRepository.findBySummaryLogId(head)

/**
 * Resolve the committed head as of an instant — the latest summary-log
 * submission whose stream event committed at or before `at`. Returns `null`
 * when the partition has no such submission.
 *
 * @param {import('../repository/stream-port.js').WasteBalanceStreamRepository} streamRepository
 * @param {{ registrationId: string, accreditationId: string | null }} partition
 * @param {string} at
 * @returns {Promise<string | null>}
 */
const committedHeadAt = async (
  streamRepository,
  { registrationId, accreditationId },
  at
) => {
  const instant = new Date(at).getTime()
  const events = await streamRepository.findAllByPartition(
    registrationId,
    accreditationId
  )
  const submissions = events.filter(
    (event) =>
      event.kind === STREAM_EVENT_KIND.SUMMARY_LOG_SUBMITTED &&
      event.createdAt.getTime() <= instant
  )

  if (submissions.length === 0) {
    return null
  }

  const latest = submissions[submissions.length - 1]
  return /** @type {import('../repository/stream-schema.js').SummaryLogSubmittedPayload} */ (
    latest.payload
  ).summaryLogId
}

/**
 * Committed row states of a registration at its current head submission. The
 * head resolves in one stream lookup; the membership query then returns every
 * row whose committed state belongs to that submission.
 *
 * @param {{
 *   streamRepository: import('../repository/stream-port.js').WasteBalanceStreamRepository,
 *   rowStateRepository: import('../repository/row-states-port.js').RowStateRepository,
 *   organisationId: string,
 *   registrationId: string,
 *   accreditationId: string | null
 * }} context
 * @returns {Promise<RowState[]>}
 */
export const committedRowStatesForRegistration = async ({
  streamRepository,
  rowStateRepository,
  registrationId,
  accreditationId
}) => {
  const head = await latestCommittedSummaryLogId(streamRepository, {
    registrationId,
    accreditationId
  })

  return rowStatesForHead(rowStateRepository, head)
}

/**
 * Committed row states of a registration as of an instant — the snapshot of
 * the latest submission committed at or before `at` (an ISO timestamp matched
 * against each stream event's `createdAt`).
 *
 * @param {{
 *   streamRepository: import('../repository/stream-port.js').WasteBalanceStreamRepository,
 *   rowStateRepository: import('../repository/row-states-port.js').RowStateRepository,
 *   organisationId: string,
 *   registrationId: string,
 *   accreditationId: string | null,
 *   at: string
 * }} context
 * @returns {Promise<RowState[]>}
 */
export const committedRowStatesAt = async ({
  streamRepository,
  rowStateRepository,
  registrationId,
  accreditationId,
  at
}) => {
  const head = await committedHeadAt(
    streamRepository,
    { registrationId, accreditationId },
    at
  )

  return rowStatesForHead(rowStateRepository, head)
}

/**
 * @param {import('../repository/stream-port.js').WasteBalanceStreamRepository} streamRepository
 * @param {string} registrationId
 * @param {RowState[]} documents
 * @returns {Promise<Map<string, number>>}
 */
const streamPositionsForDocuments = async (
  streamRepository,
  registrationId,
  documents
) => {
  const accreditationIds = [
    ...new Set(documents.map((document) => document.accreditationId))
  ]

  const eventsByPartition = await Promise.all(
    accreditationIds.map((accreditationId) =>
      streamRepository.findAllByPartition(registrationId, accreditationId)
    )
  )

  const positions = new Map()
  for (const event of eventsByPartition.flat()) {
    if (event.kind === STREAM_EVENT_KIND.SUMMARY_LOG_SUBMITTED) {
      const payload =
        /** @type {import('../repository/stream-schema.js').SummaryLogSubmittedPayload} */ (
          event.payload
        )
      positions.set(payload.summaryLogId, event.number)
    }
  }
  return positions
}

/**
 * Per-submission history of a single row, oldest first. Each state document's
 * membership is expanded into one occurrence per submission, ordered by the
 * stream position of that submission — so a row reverting A->B->A renders three
 * occurrences from two documents.
 *
 * @param {{
 *   streamRepository: import('../repository/stream-port.js').WasteBalanceStreamRepository,
 *   rowStateRepository: import('../repository/row-states-port.js').RowStateRepository,
 *   organisationId: string,
 *   registrationId: string,
 *   rowId: string,
 *   wasteRecordType: import('#domain/waste-records/model.js').WasteRecordType
 * }} context
 * @returns {Promise<RowHistoryEntry[]>}
 */
export const rowHistory = async ({
  streamRepository,
  rowStateRepository,
  organisationId,
  registrationId,
  rowId,
  wasteRecordType
}) => {
  const documents = await rowStateRepository.findRowHistory(
    organisationId,
    registrationId,
    rowId,
    wasteRecordType
  )

  if (documents.length === 0) {
    return []
  }

  const positions = await streamPositionsForDocuments(
    streamRepository,
    registrationId,
    documents
  )

  return documents
    .flatMap((document) =>
      document.summaryLogIds.map((summaryLogId) => ({
        summaryLogId,
        streamPosition: /** @type {number} */ (positions.get(summaryLogId)),
        data: document.data,
        classification: document.classification
      }))
    )
    .sort((a, b) => a.streamPosition - b.streamPosition)
}
