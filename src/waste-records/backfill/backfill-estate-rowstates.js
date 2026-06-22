import { resolveOverseasSites } from '#application/waste-records/resolve-overseas-sites.js'
import { SUMMARY_LOG_STATUS } from '#domain/summary-logs/status.js'

import { backfillRegistrationRowStates } from './backfill-registration-rowstates.js'

/**
 * @import { RowStateRepository } from '#waste-records/repository/port.js'
 * @import { SummaryLogWithId } from '#repositories/summary-logs/port.js'
 * @import { OrderedSummaryLog } from './reconstruct-submission-rowstates.js'
 */

/**
 * A reference to an accredited registration whose accreditation no longer exists
 * on the organisation — surfaced rather than crashed on, since its rows can't be
 * classified against an accreditation that is gone.
 *
 * @typedef {Object} OrphanedAccreditation
 * @property {string} organisationId
 * @property {string} registrationId
 * @property {string} accreditationId
 */

/**
 * What the estate-wide backfill swept, for migration logging.
 *
 * @typedef {Object} EstateBackfillSummary
 * @property {number} organisationsScanned
 * @property {number} streamsBackfilled - Registration streams that received row states
 * @property {number} submissionsBackfilled
 * @property {number} rowStateWrites
 * @property {OrphanedAccreditation[]} orphanedAccreditations
 */

/**
 * The membership key and the waste-record version tags are the summary log's
 * `file.id`, not the summary-log document id — the live write path keys both on
 * `file.id`, so the backfill must too or it reconstructs nothing. A submitted
 * summary log always carries `submittedAt` (stamped at submission), which the
 * status filter upstream guarantees is the only kind reaching this mapping.
 *
 * @param {SummaryLogWithId} log
 * @returns {OrderedSummaryLog}
 */
const toOrderedSummaryLog = ({ summaryLog }) => ({
  id: summaryLog.file.id,
  status: summaryLog.status,
  submittedAt: /** @type {string} */ (summaryLog.submittedAt)
})

/**
 * Reconstruct the waste record state collection for the whole historical estate
 * from sparse version history, mirroring the live submission path's write scope:
 * only accredited registrations contribute (registered-only streams never wrote
 * row states), only submitted summary logs are replayed, and each registration's
 * stream is partitioned by its accreditation. Accreditation validity and
 * overseas-site approval are read at today's state, so a backfilled row's
 * classification reflects current factors — the historical-reading drift
 * ADR-0037 accepts for legacy submissions. Re-runnable: every registration's
 * upserts are idempotent. An accreditation referenced by a registration but
 * missing from the organisation is surfaced and skipped, not fatal.
 *
 * @param {Object} deps
 * @param {import('#repositories/organisations/port.js').OrganisationsRepository} deps.organisationsRepository
 * @param {import('#repositories/waste-records/port.js').WasteRecordsRepository} deps.wasteRecordsRepository
 * @param {import('#repositories/summary-logs/port.js').SummaryLogsRepository} deps.summaryLogsRepository
 * @param {import('#overseas-sites/repository/port.js').OverseasSitesRepository} deps.overseasSitesRepository
 * @param {RowStateRepository} deps.rowStateRepository
 * @returns {Promise<EstateBackfillSummary>}
 */
export const backfillEstateRowStates = async ({
  organisationsRepository,
  wasteRecordsRepository,
  summaryLogsRepository,
  overseasSitesRepository,
  rowStateRepository
}) => {
  const organisations = await organisationsRepository.findAll()

  let streamsBackfilled = 0
  let submissionsBackfilled = 0
  let rowStateWrites = 0
  const orphanedAccreditations = []

  for (const organisation of organisations) {
    for (const registration of organisation.registrations) {
      const { accreditationId } = registration
      if (!accreditationId) {
        continue
      }

      const logs = await summaryLogsRepository.findAllByOrgReg(
        organisation.id,
        registration.id
      )
      const summaryLogs = logs
        .filter((log) => log.summaryLog.status === SUMMARY_LOG_STATUS.SUBMITTED)
        .map(toOrderedSummaryLog)
      if (summaryLogs.length === 0) {
        continue
      }

      let accreditation = null
      try {
        accreditation = await organisationsRepository.findAccreditationById(
          organisation.id,
          accreditationId
        )
      } catch {
        accreditation = null
      }
      if (!accreditation) {
        orphanedAccreditations.push({
          organisationId: organisation.id,
          registrationId: registration.id,
          accreditationId
        })
        continue
      }

      const wasteRecords = await wasteRecordsRepository.findByRegistration(
        organisation.id,
        registration.id
      )
      const overseasSites = await resolveOverseasSites(
        organisationsRepository,
        overseasSitesRepository,
        organisation.id,
        registration.id
      )

      const { submissionCount, rowStateWriteCount } =
        await backfillRegistrationRowStates({
          partition: {
            organisationId: organisation.id,
            registrationId: registration.id,
            accreditationId
          },
          wasteRecords,
          summaryLogs,
          accreditation,
          overseasSites,
          rowStateRepository
        })

      streamsBackfilled += 1
      submissionsBackfilled += submissionCount
      rowStateWrites += rowStateWriteCount
    }
  }

  return {
    organisationsScanned: organisations.length,
    streamsBackfilled,
    submissionsBackfilled,
    rowStateWrites,
    orphanedAccreditations
  }
}
