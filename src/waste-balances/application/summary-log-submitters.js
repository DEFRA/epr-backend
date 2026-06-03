/**
 * @typedef {{ id?: string, name?: string, email?: string, scope?: string[] } | null} SubmitAuditActor
 */

/**
 * Reduce a submit-audit actor to the stream's user summary, carrying each piece
 * of identity in its own slot — name, email and scope present only when the
 * source recorded them. A recorded-but-empty scope (`[]`, "this actor has no
 * roles") is kept and distinguished from an unrecorded one (absent, "we never
 * captured roles"). An actor with no id, or with neither a name nor an email,
 * has nothing real to attribute and is rejected (returns `null`) rather than
 * relabelled — so missing data stays visible downstream (the submission falls
 * back to backfill) instead of being masked by a fabricated label. A value is
 * never moved into a slot it does not belong in: an email stays in `email`,
 * never becomes a `name`. Shared with the unusable-actor count so both read
 * identity the same way.
 *
 * @param {SubmitAuditActor} [createdBy]
 * @returns {import('../repository/stream-schema.js').StreamUserSummary | null}
 */
export const toStreamActor = (createdBy) => {
  if (createdBy?.id === undefined) {
    return null
  }
  const { id, name, email, scope } = createdBy
  if (name === undefined && email === undefined) {
    return null
  }
  return {
    id,
    ...(name !== undefined && { name }),
    ...(email !== undefined && { email }),
    ...(scope !== undefined && { scope })
  }
}

/**
 * Recover the real submitting actor for each historical summary log from the
 * dedicated submit system-log audit. The audit names the submitter directly but
 * keys on the summary-log document id (`context.summaryLogId`); the stream keys
 * on `summaryLog.file.id`, a different namespace, so the summary-log documents
 * bridge document id → file id. Each actor is reduced to the stream's
 * user summary by `toStreamActor`, which rejects actors with no usable identity
 * so missing data is never masked by a fabricated label.
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
