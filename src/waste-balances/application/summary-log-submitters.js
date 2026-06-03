import { BACKFILL_ACTOR } from '../repository/stream-schema.js'

/**
 * Which source supplied a recovered submitter, or that none did. Shared with the
 * load path so recovery provenance is counted under stable keys.
 *
 * @typedef {'systemLog' | 'transaction' | 'backfill'} SubmitterSource
 * @type {{ SYSTEM_LOG: 'systemLog', TRANSACTION: 'transaction', BACKFILL: 'backfill' }}
 */
export const SUBMITTER_SOURCE = {
  SYSTEM_LOG: 'systemLog',
  TRANSACTION: 'transaction',
  BACKFILL: 'backfill'
}

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

/**
 * @typedef {{ id?: string, name?: string, email?: string, scope?: string[] } | null} SubmitAuditActor
 */

/**
 * Reduce a submit-audit actor to the stream's `{ id, name }` summary, or `null`
 * when it carries no usable identity. A human actor's email is its only captured
 * label, so it stands in for the name; an actor with no id, or with neither a
 * name nor an email, has nothing real to attribute and is rejected rather than
 * relabelled with its id — so missing data stays visible downstream (the
 * submission falls back to backfill) instead of being masked by a fabricated
 * name. Shared with the unusable-actor count so both read identity the same way.
 *
 * @param {SubmitAuditActor} [createdBy]
 * @returns {import('../repository/stream-schema.js').StreamUserSummary | null}
 */
export const toStreamActor = (createdBy) => {
  const name = createdBy?.name ?? createdBy?.email
  if (createdBy?.id === undefined || name === undefined) {
    return null
  }
  return { id: createdBy.id, name }
}

/**
 * Recover the real submitting actor for each historical summary log from the
 * dedicated submit system-log audit. The audit names the submitter directly but
 * keys on the summary-log document id (`context.summaryLogId`); the stream keys
 * on `summaryLog.file.id`, a different namespace, so the summary-log documents
 * bridge document id → file id. Each actor is reduced to the stream's
 * `{ id, name }` summary by `toStreamActor`, which rejects actors with no usable
 * identity so missing data is never masked by a fabricated name.
 *
 * A document submitted more than once keeps the most recent audit: callers
 * supply `submitActors` newest-first, so the first one seen for a file id wins.
 * An audit whose document is absent from `summaryLogDocs` is left unmapped and
 * falls back downstream — only SUBMITTED documents are attributed, and those are
 * exactly the ones the document query returns, so the bridge joins the
 * population that gets attributed. Unlike the transaction builder there is no
 * backfill-sentinel guard: a submit audit's actor is always a real session, never
 * the rebuild's own placeholder.
 *
 * @param {Object} params
 * @param {Array<{ summaryLogId: string, createdBy?: SubmitAuditActor }>} params.submitActors
 * @param {Array<{ id: string, summaryLog: { file?: { id?: string } } }>} params.summaryLogDocs
 * @returns {Map<string, import('../repository/stream-schema.js').StreamUserSummary>}
 */
export const buildSystemLogSubmitters = ({ submitActors, summaryLogDocs }) => {
  const fileIdByDocId = new Map()
  for (const doc of summaryLogDocs) {
    const fileId = doc.summaryLog?.file?.id
    if (fileId !== undefined) {
      fileIdByDocId.set(doc.id, fileId)
    }
  }

  const submitters = new Map()
  for (const { summaryLogId, createdBy } of submitActors) {
    const actor = toStreamActor(createdBy)
    if (actor === null) {
      continue
    }
    const fileId = fileIdByDocId.get(summaryLogId)
    if (fileId === undefined || submitters.has(fileId)) {
      continue
    }
    submitters.set(fileId, actor)
  }

  return submitters
}

/**
 * @typedef {{
 *   submitter: import('../repository/stream-schema.js').StreamUserSummary,
 *   source: SubmitterSource
 * }} ResolvedSubmitter
 */

/**
 * Resolve each summary log's submitter from the available sources, preferring
 * the system-log audit over the embedded transaction actor. The audit is a
 * direct submitter→summary-log link wired since the submit audit shipped; the
 * transaction actor only exists for submissions written from May 2026 and can
 * be attributed to the wrong person when a PRN-driven transaction credits the
 * same waste-record version. Each resolved entry is tagged with its source so
 * callers can count recovery provenance, and where both sources name the same
 * summary log their actor ids are compared so disagreement surfaces as a
 * measured rate rather than silently trusting one source.
 *
 * @param {Object} params
 * @param {Map<string, import('../repository/stream-schema.js').StreamUserSummary>} params.systemLogSubmitters
 * @param {Map<string, import('../repository/stream-schema.js').StreamUserSummary>} params.transactionSubmitters
 * @returns {{
 *   submitters: Map<string, ResolvedSubmitter>,
 *   agreement: { comparedCount: number, mismatchedCount: number }
 * }}
 */
export const resolveSummaryLogSubmitters = ({
  systemLogSubmitters,
  transactionSubmitters
}) => {
  /** @type {Map<string, ResolvedSubmitter>} */
  const submitters = new Map()
  for (const [fileId, submitter] of transactionSubmitters) {
    submitters.set(fileId, { submitter, source: SUBMITTER_SOURCE.TRANSACTION })
  }
  for (const [fileId, submitter] of systemLogSubmitters) {
    submitters.set(fileId, { submitter, source: SUBMITTER_SOURCE.SYSTEM_LOG })
  }

  let comparedCount = 0
  let mismatchedCount = 0
  for (const [fileId, systemLogSubmitter] of systemLogSubmitters) {
    const transactionSubmitter = transactionSubmitters.get(fileId)
    if (transactionSubmitter === undefined) {
      continue
    }
    comparedCount += 1
    if (systemLogSubmitter.id !== transactionSubmitter.id) {
      mismatchedCount += 1
    }
  }

  return { submitters, agreement: { comparedCount, mismatchedCount } }
}
