/**
 * Build a map from summary-log file ID to the submitting actor, sourced from
 * the system-logs collection. Each summary-log submission audit event records
 * the submitter's identity keyed by the summary-log document _id
 * (`context.summaryLogId`). The summary-log documents carry both the document
 * _id and the file identifier (`file.id`) that the stream uses as its natural
 * key. This function joins the two namespaces so callers can look up submitters
 * by the file-level ID that computeRebuiltStream expects.
 *
 * @param {Object} params
 * @param {Map<string, import('../repository/stream-schema.js').StreamUserSummary>} params.systemLogSubmitters
 *   Map from summary-log document _id to the submitting actor, as returned by
 *   systemLogsRepository.findSubmittersBySummaryLogIds.
 * @param {Array<{ id: *, summaryLog: { file: { id: string } } }>} params.summaryLogDocs
 *   Summary-log documents from findAllByOrgReg (id = document _id, summaryLog.file.id = file key).
 * @returns {Map<string, import('../repository/stream-schema.js').StreamUserSummary>}
 *   Map from summary-log file ID to actor.
 */
export const buildSummaryLogSubmitters = ({
  systemLogSubmitters,
  summaryLogDocs
}) => {
  /** @type {Map<string, import('../repository/stream-schema.js').StreamUserSummary>} */
  const submitters = new Map()

  for (const doc of summaryLogDocs) {
    const docId = String(doc.id)
    const submitter = systemLogSubmitters.get(docId)
    if (submitter) {
      submitters.set(doc.summaryLog.file.id, submitter)
    }
  }

  return submitters
}
