import { BACKFILL_ACTOR } from '../repository/stream-schema.js'

/**
 * @param {Array<{ versions: Array<{ id: string, summaryLog: { id: string } }> }>} wasteRecords
 * @returns {Map<string, string>}
 */
const indexSummaryLogIdByVersion = (wasteRecords) => {
  const summaryLogIdByVersion = new Map()
  for (const record of wasteRecords) {
    for (const version of record.versions ?? []) {
      summaryLogIdByVersion.set(version.id, version.summaryLog.id)
    }
  }
  return summaryLogIdByVersion
}

/**
 * Recover the real submitting actor for each historical summary log from the
 * embedded waste-balance transactions. The submitting session is not persisted
 * on the summary-log document or the waste-record version, but every embedded
 * waste-balance transaction stamps `createdBy` with the submitting user and
 * links the waste-record version it credited via `currentVersionId`. Each
 * version carries the `summaryLog.id` of the submission that produced it, so
 * the chain transaction.createdBy → currentVersionId → version → summaryLog.id
 * yields a summary-log-id → actor map straight from authoritative sources.
 *
 * The system placeholder actor is rejected: it is the rebuild's own marker for
 * "no real actor", so accepting it would falsely report a submission as
 * recovered and hide the gap from the divergence diagnostic. Submissions that
 * predate the SQS submit path may carry no recoverable actor at all; those are
 * left to fall back to the backfill actor rather than be credited to a
 * placeholder.
 *
 * Sourced from the embedded waste-balance document's `transactions` and the
 * registration's waste records; typed structurally to the fields consumed.
 *
 * @param {Object} params
 * @param {Array<{ createdBy?: { id: string, name: string } | null, entities?: Array<{ currentVersionId: string }> }>} [params.transactions]
 * @param {Array<{ versions: Array<{ id: string, summaryLog: { id: string } }> }>} params.wasteRecords
 * @returns {Map<string, import('../repository/stream-schema.js').StreamUserSummary>}
 */
export const buildSummaryLogSubmitters = ({ transactions, wasteRecords }) => {
  const summaryLogIdByVersion = indexSummaryLogIdByVersion(wasteRecords)

  const submitters = new Map()
  for (const transaction of transactions ?? []) {
    const { createdBy } = transaction
    if (createdBy?.id === undefined || createdBy.id === BACKFILL_ACTOR.id) {
      continue
    }
    for (const entity of transaction.entities ?? []) {
      const summaryLogId = summaryLogIdByVersion.get(entity.currentVersionId)
      if (summaryLogId === undefined || submitters.has(summaryLogId)) {
        continue
      }
      submitters.set(summaryLogId, {
        id: createdBy.id,
        name: createdBy.name
      })
    }
  }

  return submitters
}
