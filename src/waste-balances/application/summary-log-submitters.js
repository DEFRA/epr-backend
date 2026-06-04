/**
 * @typedef {{ id?: string, name?: string, email?: string, scope?: string[] } | null} SubmitAuditActor
 */

/**
 * Reduce a submit-audit actor to the stream's `{ id, name?, email? }` summary,
 * or `null` when it carries no usable identity. The `id` is the proof of the
 * actor; `name` and `email` are distinct labels, each carried only when the
 * audit holds it. An actor with no id, or with neither a name nor an email, has
 * nothing real to attribute, so it is rejected and the submission falls back to
 * backfill — keeping missing data visible downstream. Shared with the
 * unusable-actor count so both read identity the same way.
 *
 * @param {SubmitAuditActor} [createdBy]
 * @returns {import('../repository/stream-schema.js').StreamUserSummary | null}
 */
export const toStreamActor = (createdBy) => {
  if (createdBy?.id === undefined || (!createdBy.name && !createdBy.email)) {
    return null
  }
  return {
    id: createdBy.id,
    ...(createdBy.name && { name: createdBy.name }),
    ...(createdBy.email && { email: createdBy.email })
  }
}

/**
 * Recover the real submitting actor for each historical summary log from the
 * dedicated submit system-log audit. The audit names the submitter directly but
 * keys on the summary-log document id (`context.summaryLogId`); the stream keys
 * on `summaryLog.file.id`, a different namespace, so the summary-log documents
 * bridge document id → file id. Each actor is reduced to the stream's
 * `{ id, name?, email? }` summary by `toStreamActor`, which rejects actors with
 * no usable identity, keeping missing data visible downstream.
 *
 * A document submitted more than once keeps the most recent audit: callers
 * supply `submitActors` newest-first, so the first one seen for a file id wins.
 * An audit whose document is absent from `summaryLogDocs` is left unmapped and
 * falls back downstream — only SUBMITTED documents are attributed, and those are
 * exactly the ones the document query returns, so the bridge joins the
 * population that gets attributed. A submit audit's actor is always a real
 * session, never the rebuild's own placeholder, so there is no backfill-sentinel
 * guard.
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
