import { projectSummaryLogRowState } from '#waste-records/application/project-summary-log-row-state.js'
import { SUMMARY_LOG_STATUS } from '#domain/summary-logs/status.js'

import { compareSubmissionOrder } from './submission-order.js'

/**
 * @import { ClassifiedRow } from '#waste-balances/application/target-amount.js'
 * @import { WasteRecord } from '#domain/waste-records/model.js'
 */

/**
 * A submission's reconstructed row-state membership: the entries to upsert
 * against the summary-log row state collection for one historical submission,
 * alongside the provenance the backfill stamps onto its replayed submitted
 * event — when it happened (`submittedAt`) and who submitted it (`submittedBy`,
 * absent when the submitter could not be recovered).
 *
 * @typedef {Object} SubmissionSummaryLogRowStates
 * @property {string} summaryLogId
 * @property {ClassifiedRow[]} entries
 * @property {string} submittedAt - ISO8601 timestamp
 * @property {import('#waste-balances/repository/ledger-schema.js').LedgerUserSummary} [submittedBy]
 */

/**
 * A summary log reduced to what drives stream order, membership, and the
 * provenance of its replayed submitted event.
 *
 * @typedef {Object} OrderedSummaryLog
 * @property {string} id - Matches the `summaryLog.id` tag on waste-record versions
 * @property {string} status
 * @property {string} submittedAt - ISO8601 timestamp
 * @property {import('#waste-balances/repository/ledger-schema.js').LedgerUserSummary} [submittedBy]
 */

/**
 * Reconstruct a waste record's data as it stood at a submission point by
 * shallow-merging version data objects up to the latest version whose
 * summaryLog is in the seen set. Returns null when the row had no version at or
 * before that point — it had not yet been submitted.
 *
 * @param {WasteRecord['versions']} versions
 * @param {Set<string>} seenSummaryLogIds
 * @returns {Object | null}
 */
const reconstructDataAtSubmission = (versions, seenSummaryLogIds) => {
  let lastMatchIndex = -1
  for (let i = 0; i < versions.length; i++) {
    if (seenSummaryLogIds.has(versions[i].summaryLog.id)) {
      lastMatchIndex = i
    }
  }

  if (lastMatchIndex === -1) {
    return null
  }

  let data = {}
  for (let i = 0; i <= lastMatchIndex; i++) {
    data = { ...data, ...versions[i].data }
  }
  return data
}

/**
 * Reconstruct one summary-log row state membership per historical submission from
 * the sparse per-row version history, in submission (stream) order. For each
 * submitted summary log, every waste record that exists as of that submission
 * contributes its as-of-submission data, classified exactly as the live write
 * path classifies it. The returned descriptors are upserted — each against its
 * summaryLogId — to rebuild the summary-log row state collection from the
 * authoritative version history alone.
 *
 * @param {Object} params
 * @param {WasteRecord[]} params.wasteRecords
 * @param {OrderedSummaryLog[]} params.summaryLogs
 * @param {Object} params.accreditation
 * @param {import('#domain/summary-logs/table-schemas/validation-pipeline.js').OverseasSitesContext} params.overseasSites
 * @returns {SubmissionSummaryLogRowStates[]}
 */
export const reconstructSubmissionSummaryLogRowStates = ({
  wasteRecords,
  summaryLogs,
  accreditation,
  overseasSites
}) => {
  const submitted = summaryLogs
    .filter((log) => log.status === SUMMARY_LOG_STATUS.SUBMITTED)
    .sort((a, b) =>
      compareSubmissionOrder(a.submittedAt, a.id, b.submittedAt, b.id)
    )

  const seenSummaryLogIds = new Set()
  return submitted.map((log) => {
    seenSummaryLogIds.add(log.id)
    const entries = wasteRecords.flatMap((record) => {
      const data = reconstructDataAtSubmission(
        record.versions,
        seenSummaryLogIds
      )
      if (data === null) {
        return []
      }
      return [
        projectSummaryLogRowState(
          { ...record, data },
          accreditation,
          overseasSites
        )
      ]
    })
    return {
      summaryLogId: log.id,
      entries,
      submittedAt: log.submittedAt,
      ...(log.submittedBy && { submittedBy: log.submittedBy })
    }
  })
}
