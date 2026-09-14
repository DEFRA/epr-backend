/** @import {SummaryLogsRepository} from '#repositories/summary-logs/port.js' */

/**
 * Load all summary logs for a single (org, registration) pair into a Map
 * keyed by the submission's *file* id — the value the waste balance ledger
 * records and the export looks a row up by, not the summary log document's
 * id. Used by stream-csv-export to populate the "Submitted At" column without
 * N+1 lookups during streaming.
 *
 * Memory cost is small (count is bounded by submissions per registration —
 * typically dozens at most).
 *
 * @param {Pick<SummaryLogsRepository, 'findAllByOrgReg'>} summaryLogsRepository
 * @param {string} organisationId
 * @param {string} registrationId
 * @returns {Promise<Map<string, { submittedAt: string }>>}
 */
export const loadSummaryLogMap = async (
  summaryLogsRepository,
  organisationId,
  registrationId
) => {
  const summaryLogs = await summaryLogsRepository.findAllByOrgReg(
    organisationId,
    registrationId
  )

  return new Map(
    summaryLogs.map((entry) => [
      entry.summaryLog.file.id,
      { submittedAt: entry.summaryLog.submittedAt ?? '' }
    ])
  )
}
