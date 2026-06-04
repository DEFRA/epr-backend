/**
 * @typedef {{ id?: string, name?: string, email?: string, scope?: string[] } | null} SubmitAuditActor
 */

/**
 * Reduce a submit-audit actor to the stream's `{ id, name?, email? }` summary,
 * or `null` when no actor is present. The `id` is the proof of the actor; `name`
 * and `email` are distinct labels, each carried only when the audit holds it. An
 * actor identified solely by its id is still a real, attributable actor and is
 * carried as `{ id }`; only an actor with no id has nothing to attribute and is
 * rejected so the submission falls back to backfill. Shared with the attribution
 * accounting so both read identity the same way.
 *
 * @param {SubmitAuditActor} [createdBy]
 * @returns {import('../repository/stream-schema.js').StreamUserSummary | null}
 */
export const toStreamActor = (createdBy) => {
  if (createdBy?.id === undefined) {
    return null
  }
  return {
    id: createdBy.id,
    ...(createdBy.name && { name: createdBy.name }),
    ...(createdBy.email && { email: createdBy.email })
  }
}

/**
 * Per-event-kind attribution quality for one actor-label combination. Each cell
 * is mutually exclusive: an event lands in exactly one of `nameAndEmail`,
 * `nameOnly`, `emailOnly`, `idOnly` (a real, attributed actor identified only by
 * its id) or `noActor` (no id at all — a genuine backfill). `scope` is an
 * orthogonal tally of how many of those actors also carried a non-empty role
 * scope, so System Log render fidelity is visible before cutover.
 *
 * @typedef {Object} ActorAttributionCounts
 * @property {number} nameAndEmail
 * @property {number} nameOnly
 * @property {number} emailOnly
 * @property {number} idOnly
 * @property {number} noActor
 * @property {number} scope
 */

/**
 * @returns {ActorAttributionCounts}
 */
export const emptyAttributionCounts = () => ({
  nameAndEmail: 0,
  nameOnly: 0,
  emailOnly: 0,
  idOnly: 0,
  noActor: 0,
  scope: 0
})

/**
 * Classify one actor into its attribution cell, counting scope presence
 * alongside. An actor with no id is a genuine backfill (`noActor`) regardless of
 * any name or email it carries, because without an id there is nobody to
 * attribute the event to.
 *
 * @param {SubmitAuditActor} [createdBy]
 * @returns {ActorAttributionCounts}
 */
export const classifyActorAttribution = (createdBy) => {
  const counts = emptyAttributionCounts()
  if (createdBy?.id === undefined) {
    counts.noActor = 1
    return counts
  }
  const hasName = Boolean(createdBy.name)
  const hasEmail = Boolean(createdBy.email)
  if (hasName && hasEmail) {
    counts.nameAndEmail = 1
  } else if (hasName) {
    counts.nameOnly = 1
  } else if (hasEmail) {
    counts.emailOnly = 1
  } else {
    counts.idOnly = 1
  }
  if (createdBy.scope?.length) {
    counts.scope = 1
  }
  return counts
}

/**
 * Per-event-kind attribution matrix. Sparse: only kinds that produced at least
 * one event appear. Each kind maps to its accumulated `ActorAttributionCounts`,
 * so the quality of actor attribution can be read per kind before cutover.
 *
 * @typedef {Partial<Record<import('../repository/stream-schema.js').StreamEventKind, ActorAttributionCounts>>} AttributionMatrix
 */

const ATTRIBUTION_CELLS = /** @type {const} */ ([
  'nameAndEmail',
  'nameOnly',
  'emailOnly',
  'idOnly',
  'noActor',
  'scope'
])

/**
 * Classify one event's actor and add it into the matrix under its kind,
 * creating the kind's row on first sight.
 *
 * @param {AttributionMatrix} matrix
 * @param {import('../repository/stream-schema.js').StreamEventKind} kind
 * @param {SubmitAuditActor} [createdBy]
 */
export const addAttribution = (matrix, kind, createdBy) => {
  const row = (matrix[kind] ??= emptyAttributionCounts())
  const counts = classifyActorAttribution(createdBy)
  for (const cell of ATTRIBUTION_CELLS) {
    row[cell] += counts[cell]
  }
}

/**
 * Combine per-kind attribution matrices, summing each cell for shared kinds.
 *
 * @param {AttributionMatrix[]} matrices
 * @returns {AttributionMatrix}
 */
export const mergeAttributionMatrices = (matrices) => {
  /** @type {AttributionMatrix} */
  const merged = {}
  for (const matrix of matrices) {
    for (const [rawKind, counts] of Object.entries(matrix)) {
      const kind =
        /** @type {import('../repository/stream-schema.js').StreamEventKind} */ (
          rawKind
        )
      const row = (merged[kind] ??= emptyAttributionCounts())
      for (const cell of ATTRIBUTION_CELLS) {
        row[cell] += counts[cell]
      }
    }
  }
  return merged
}

/**
 * Render an attribution matrix as a stable, log-friendly string. Kinds are
 * sorted so the line is deterministic; each kind lists its cell counts.
 *
 * @param {AttributionMatrix} matrix
 * @returns {string}
 */
export const formatAttributionMatrix = (matrix) =>
  Object.keys(matrix)
    .sort((a, b) => a.localeCompare(b))
    .map((kind) => {
      const row =
        matrix[
          /** @type {import('../repository/stream-schema.js').StreamEventKind} */ (
            kind
          )
        ]
      const cells = ATTRIBUTION_CELLS.map(
        (cell) => `${cell}:${/** @type {ActorAttributionCounts} */ (row)[cell]}`
      ).join(',')
      return `${kind}{${cells}}`
    })
    .join(';')

/**
 * Recover the real submitting actor for each historical summary log from the
 * dedicated submit system-log audit. The audit names the submitter directly but
 * keys on the summary-log document id (`context.summaryLogId`); the stream keys
 * on `summaryLog.file.id`, a different namespace, so the summary-log documents
 * bridge document id → file id. Each actor is reduced to the stream's
 * `{ id, name?, email? }` summary by `toStreamActor`, which rejects only an
 * actor with no id at all, keeping genuinely actor-less submissions visible
 * downstream.
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
