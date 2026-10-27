/** @import { TypedLogger } from '#common/hapi-types.js' */

/**
 * Backfills each document in turn. A failure is logged and swallowed so one
 * bad document never stops the sweep, and is retried on the next run.
 *
 * @template Outcome
 * @param {{
 *   ids: string[],
 *   backfillOne: (id: string) => Promise<Outcome | null>,
 *   tally: (id: string, outcome: Outcome) => void,
 *   documentName: string,
 *   logger: TypedLogger
 * }} sweep
 *   `backfillOne` returns null for a document that has gone.
 * @returns {Promise<number>} how many failed
 */
export const sweepNumbersBackfill = async ({
  ids,
  backfillOne,
  tally,
  documentName,
  logger
}) => {
  let failed = 0
  for (const id of ids) {
    try {
      const outcome = await backfillOne(id) // NOSONAR(javascript:S9382) one at a time, to spare the database
      if (outcome) {
        tally(id, outcome)
      }
    } catch (error) {
      logger.error({
        err: error,
        message: `Failed to backfill numbers for ${documentName} ${id}`
      })
      failed++
    }
  }
  return failed
}

/**
 * @typedef {Object} ReasonedBackfillResult
 * @property {number} missing - documents lacking a number when the run started
 * @property {number} mapped - given at least one number (would be, on a dry run)
 * @property {number} unmapped - left lacking a number
 * @property {Record<string, string[]>} unmappedReasons - the ids of the documents left lacking a number, by reason
 * @property {number} failed - not written; retried on the next run
 * @property {number} auditFailed - written but not audited
 */

/**
 * @typedef {{ mapped: boolean, unmapped: string[], auditFailed: boolean }} ReasonedOutcome
 */

/**
 * Sweeps the documents, returning each one it cannot fully map under every
 * reason that applies.
 *
 * @param {{
 *   ids: string[],
 *   backfillOne: (id: string) => Promise<ReasonedOutcome | null>,
 *   documentName: string,
 *   logger: TypedLogger
 * }} sweep
 * @returns {Promise<ReasonedBackfillResult>}
 */
export const sweepNumbersBackfillByReason = async ({ ids, ...sweep }) => {
  const result = {
    missing: ids.length,
    mapped: 0,
    unmapped: 0,
    /** @type {Record<string, string[]>} */
    unmappedReasons: {},
    failed: 0,
    auditFailed: 0
  }

  result.failed = await sweepNumbersBackfill({
    ids,
    ...sweep,
    tally: (id, outcome) => {
      result.mapped += Number(outcome.mapped)
      result.unmapped += Number(outcome.unmapped.length > 0)
      for (const reason of outcome.unmapped) {
        result.unmappedReasons[reason] = [
          ...(result.unmappedReasons[reason] ?? []),
          id
        ]
      }
      result.auditFailed += Number(outcome.auditFailed)
    }
  })

  return result
}
