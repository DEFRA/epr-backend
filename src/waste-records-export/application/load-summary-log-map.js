import { toOrganisationNumber } from '#domain/organisations/numbers.js'

/** @import {Organisation} from '#domain/organisations/model.js' */
/** @import {Registration} from '#domain/organisations/registration.js' */
/** @import {SummaryLogsRepository} from '#repositories/summary-logs/port.js' */

/**
 * Load all summary logs for a single (org, registration) pair into a Map
 * keyed by the submission's *file* id — the value the waste balance ledger
 * records and the export looks a row up by, not the summary log document's
 * id. Used by stream-csv-export to populate the "Submitted At" column without
 * N+1 lookups during streaming. Summary logs are found by the registration's
 * number, so a registration without one shows no submission times.
 *
 * Memory cost is small (count is bounded by submissions per registration —
 * typically dozens at most).
 *
 * @param {Pick<SummaryLogsRepository, 'findAll'>} summaryLogsRepository
 * @param {Pick<Organisation, 'orgId'>} organisation
 * @param {Pick<Registration, 'registrationNumber'>} registration
 * @returns {Promise<Map<string, { submittedAt: string }>>}
 */
export const loadSummaryLogMap = async (
  summaryLogsRepository,
  { orgId },
  { registrationNumber }
) => {
  if (!registrationNumber) {
    return new Map()
  }

  const summaryLogs = await summaryLogsRepository.findAll({
    organisationNumber: toOrganisationNumber(String(orgId)),
    registrationNumber
  })

  return new Map(
    summaryLogs.map((entry) => [
      entry.summaryLog.file.id,
      { submittedAt: entry.summaryLog.submittedAt ?? '' }
    ])
  )
}
