/**
 * Total order over submissions matching the historical replay order: ascending
 * `submittedAt`, then `summaryLogId` as a stable tiebreak. Reconstruction, the
 * per-submission watermark skip, and the whole-ledger last-submission probe all
 * order by this one primitive, so a resumed run's "already covered" decision
 * can never drift from the order the rows were originally replayed in.
 *
 * @param {string} aSubmittedAt
 * @param {string} aSummaryLogId
 * @param {string} bSubmittedAt
 * @param {string} bSummaryLogId
 * @returns {number}
 */
export const compareSubmissionOrder = (
  aSubmittedAt,
  aSummaryLogId,
  bSubmittedAt,
  bSummaryLogId
) =>
  new Date(aSubmittedAt).getTime() - new Date(bSubmittedAt).getTime() ||
  aSummaryLogId.localeCompare(bSummaryLogId)

/**
 * Whether a submission has already been committed by a prior run — i.e. it sits
 * at or before the persisted watermark in replay order. A run resumes at the
 * first submission this returns false for.
 *
 * @param {{ submittedAt: string, summaryLogId: string }} submission
 * @param {{ submittedAt: string, summaryLogId: string } | null} watermark
 * @returns {boolean}
 */
export const isCoveredByWatermark = (submission, watermark) =>
  watermark !== null &&
  compareSubmissionOrder(
    submission.submittedAt,
    submission.summaryLogId,
    watermark.submittedAt,
    watermark.summaryLogId
  ) <= 0
