import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'

import { resolveOverseasSites } from '#application/waste-records/resolve-overseas-sites.js'
import { SUMMARY_LOG_STATUS } from '#domain/summary-logs/status.js'

import { backfillRegistrationSummaryLogRowStates } from './backfill-registration-summary-log-row-states.js'
import {
  compareSubmissionOrder,
  isCoveredByWatermark
} from './submission-order.js'

/**
 * @import { SummaryLogRowStateRepository } from '#waste-records/repository/port.js'
 * @import { SummaryLogWithId } from '#repositories/summary-logs/port.js'
 * @import { OrderedSummaryLog } from './reconstruct-submission-summary-log-row-states.js'
 * @import { SummaryLogRowStatesBackfillWatermarkRepository } from './watermark/port.js'
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
 * @property {number} ledgersBackfilled - Registration ledgers that committed new row states this run
 * @property {number} ledgersSkippedComplete - Ledgers already fully backfilled at their watermark, skipped without reconstruction
 * @property {number} submissionsBackfilled - Submissions newly committed this run
 * @property {number} summaryLogRowStateWrites
 * @property {OrphanedAccreditation[]} orphanedAccreditations
 */

/**
 * A running snapshot of the estate sweep, emitted once per registration as the
 * loop advances so a long backfill is observable in-flight. The counters mirror
 * the terminal EstateBackfillSummary; organisationId and registrationId name the
 * ledger the sweep has just reached. The server layer decides how often to log
 * these.
 *
 * @typedef {Object} EstateBackfillProgress
 * @property {number} registrationsProcessed - Registrations iterated so far, across all organisations
 * @property {string} organisationId - Organisation whose registration was just processed
 * @property {string} registrationId - Registration just processed
 * @property {number} ledgersBackfilled
 * @property {number} ledgersSkippedComplete
 * @property {number} submissionsBackfilled
 * @property {number} summaryLogRowStateWrites
 * @property {number} orphanedAccreditations - Count surfaced so far
 */

/**
 * What backfilling a single registration ledger contributed: an orphaned
 * accreditation to surface, the submission and write counts it committed, or a
 * skip because the ledger is already complete at its watermark. `null` means
 * the ledger was skipped for having no submitted summary logs.
 *
 * @typedef {Object} LedgerBackfilled
 * @property {number} submissionsCommitted
 * @property {number} summaryLogRowStateWriteCount
 *
 * @typedef {Object} LedgerOrphaned
 * @property {OrphanedAccreditation} orphanedAccreditation
 *
 * @typedef {Object} LedgerSkippedComplete
 * @property {true} skippedComplete
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
 * Whether the ledger is already fully backfilled: its last submission in replay
 * order sits at or before the persisted watermark. The empty case is handled by
 * the caller, so the reduce is seeded from the first submission.
 *
 * @param {OrderedSummaryLog[]} summaryLogs
 * @param {import('./watermark/port.js').BackfillWatermark | null} watermark
 * @returns {boolean}
 */
const isLedgerCompleteAtWatermark = (summaryLogs, watermark) => {
  const lastSubmission = summaryLogs.reduce(
    (latest, log) =>
      compareSubmissionOrder(
        log.submittedAt,
        log.id,
        latest.submittedAt,
        latest.id
      ) > 0
        ? log
        : latest,
    summaryLogs[0]
  )
  return isCoveredByWatermark(
    {
      submittedAt: lastSubmission.submittedAt,
      summaryLogId: lastSubmission.id
    },
    watermark
  )
}

/**
 * Resolve the registration's accreditation at today's state. A registered-only
 * registration (no accreditationId) resolves to a null accreditation. When the
 * referenced accreditation is missing from the organisation it is surfaced as
 * orphaned rather than fatal; any other lookup failure propagates.
 *
 * @param {Object} args
 * @param {import('#repositories/organisations/port.js').OrganisationsRepository} args.organisationsRepository
 * @param {import('#domain/organisations/model.js').Organisation} args.organisation
 * @param {import('#domain/organisations/registration.js').Registration} args.registration
 * @returns {Promise<{ accreditation: import('#domain/organisations/accreditation.js').Accreditation | null } | LedgerOrphaned>}
 */
const resolveAccreditationOrOrphan = async ({
  organisationsRepository,
  organisation,
  registration
}) => {
  const { accreditationId } = registration
  if (!accreditationId) {
    return { accreditation: null }
  }
  try {
    const accreditation = await organisationsRepository.findAccreditationById(
      organisation.id,
      accreditationId
    )
    return { accreditation }
  } catch (error) {
    const statusCode = Boom.isBoom(error) ? error.output.statusCode : undefined
    if (statusCode !== StatusCodes.NOT_FOUND) {
      throw error
    }
    return {
      orphanedAccreditation: {
        organisationId: organisation.id,
        registrationId: registration.id,
        accreditationId
      }
    }
  }
}

/**
 * Reconstruct and commit the ledger's row states from today's waste records and
 * overseas-site state, keyed by accreditation existence (`accreditationId ??
 * null`), and advance the watermark. Returns the submission and write counts.
 *
 * @param {Object} args
 * @param {import('#domain/organisations/model.js').Organisation} args.organisation
 * @param {import('#domain/organisations/registration.js').Registration} args.registration
 * @param {import('#domain/organisations/accreditation.js').Accreditation | null} args.accreditation
 * @param {import('./watermark/port.js').BackfillWatermark | null} args.watermark
 * @param {OrderedSummaryLog[]} args.summaryLogs
 * @param {import('#repositories/organisations/port.js').OrganisationsRepository} args.organisationsRepository
 * @param {import('#repositories/waste-records/port.js').WasteRecordsRepository} args.wasteRecordsRepository
 * @param {import('#overseas-sites/repository/port.js').OverseasSitesRepository} args.overseasSitesRepository
 * @param {SummaryLogRowStateRepository} args.summaryLogRowStateRepository
 * @param {SummaryLogRowStatesBackfillWatermarkRepository} args.summaryLogRowStatesBackfillWatermarkRepository
 * @returns {Promise<LedgerBackfilled>}
 */
const commitLedgerBackfill = async ({
  organisation,
  registration,
  accreditation,
  watermark,
  summaryLogs,
  organisationsRepository,
  wasteRecordsRepository,
  overseasSitesRepository,
  summaryLogRowStateRepository,
  summaryLogRowStatesBackfillWatermarkRepository
}) => {
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

  return backfillRegistrationSummaryLogRowStates({
    ledgerId: {
      organisationId: organisation.id,
      registrationId: registration.id,
      accreditationId: registration.accreditationId ?? null
    },
    wasteRecords,
    summaryLogs,
    accreditation,
    overseasSites,
    summaryLogRowStateRepository,
    summaryLogRowStatesBackfillWatermarkRepository,
    watermark
  })
}

/**
 * Backfill one registration's ledger, mirroring the live write scope: every
 * registration with at least one submitted summary log is reconstructed,
 * keyed by accreditation existence (`accreditationId ?? null`) and
 * classified against today's accreditation (or null for a registered-only
 * registration) and overseas-site state. A skip yields null only when there are
 * no submitted summary logs, or `skippedComplete` when the ledger is already
 * backfilled to its watermark. When a registration references an accreditation
 * that is missing from the organisation, that is surfaced as orphaned rather
 * than fatal.
 *
 * @param {Object} args
 * @param {import('#domain/organisations/model.js').Organisation} args.organisation
 * @param {import('#domain/organisations/registration.js').Registration} args.registration
 * @param {import('#repositories/organisations/port.js').OrganisationsRepository} args.organisationsRepository
 * @param {import('#repositories/waste-records/port.js').WasteRecordsRepository} args.wasteRecordsRepository
 * @param {import('#repositories/summary-logs/port.js').SummaryLogsRepository} args.summaryLogsRepository
 * @param {import('#overseas-sites/repository/port.js').OverseasSitesRepository} args.overseasSitesRepository
 * @param {SummaryLogRowStateRepository} args.summaryLogRowStateRepository
 * @param {SummaryLogRowStatesBackfillWatermarkRepository} args.summaryLogRowStatesBackfillWatermarkRepository
 * @returns {Promise<LedgerBackfilled | LedgerOrphaned | LedgerSkippedComplete | null>}
 */
export const backfillRegistrationLedger = async ({
  organisation,
  registration,
  organisationsRepository,
  wasteRecordsRepository,
  summaryLogsRepository,
  overseasSitesRepository,
  summaryLogRowStateRepository,
  summaryLogRowStatesBackfillWatermarkRepository
}) => {
  const logs = await summaryLogsRepository.findAllByOrgReg(
    organisation.id,
    registration.id
  )
  const summaryLogs = logs
    .filter((log) => log.summaryLog.status === SUMMARY_LOG_STATUS.SUBMITTED)
    .map(toOrderedSummaryLog)
  if (summaryLogs.length === 0) {
    return null
  }

  const watermark = await summaryLogRowStatesBackfillWatermarkRepository.read(
    organisation.id,
    registration.id
  )
  if (isLedgerCompleteAtWatermark(summaryLogs, watermark)) {
    return { skippedComplete: true }
  }

  const resolved = await resolveAccreditationOrOrphan({
    organisationsRepository,
    organisation,
    registration
  })
  if ('orphanedAccreditation' in resolved) {
    return resolved
  }

  return commitLedgerBackfill({
    organisation,
    registration,
    accreditation: resolved.accreditation,
    watermark,
    summaryLogs,
    organisationsRepository,
    wasteRecordsRepository,
    overseasSitesRepository,
    summaryLogRowStateRepository,
    summaryLogRowStatesBackfillWatermarkRepository
  })
}

/**
 * Reconstruct the summary-log row state collection for the whole historical estate
 * from sparse version history, mirroring the live submission path's write scope:
 * every registration with submitted summary logs contributes — accredited and
 * registered-only alike — keyed by accreditation existence
 * (`accreditationId ?? null`), and only submitted summary logs are replayed.
 * Accreditation validity and overseas-site approval are read at today's
 * state, so a backfilled row's classification reflects current factors — the
 * historical-reading drift ADR-0037 accepts for legacy submissions. Re-runnable:
 * every registration's upserts are idempotent. An accreditation referenced by a
 * registration but missing from the organisation is surfaced and skipped, not
 * fatal.
 *
 * @param {Object} deps
 * @param {import('#repositories/organisations/port.js').OrganisationsRepository} deps.organisationsRepository
 * @param {import('#repositories/waste-records/port.js').WasteRecordsRepository} deps.wasteRecordsRepository
 * @param {import('#repositories/summary-logs/port.js').SummaryLogsRepository} deps.summaryLogsRepository
 * @param {import('#overseas-sites/repository/port.js').OverseasSitesRepository} deps.overseasSitesRepository
 * @param {SummaryLogRowStateRepository} deps.summaryLogRowStateRepository
 * @param {SummaryLogRowStatesBackfillWatermarkRepository} deps.summaryLogRowStatesBackfillWatermarkRepository
 * @param {(progress: EstateBackfillProgress) => void} deps.onProgress - Invoked once per registration with a running snapshot
 * @returns {Promise<EstateBackfillSummary>}
 */
export const backfillEstateSummaryLogRowStates = async ({
  organisationsRepository,
  wasteRecordsRepository,
  summaryLogsRepository,
  overseasSitesRepository,
  summaryLogRowStateRepository,
  summaryLogRowStatesBackfillWatermarkRepository,
  onProgress
}) => {
  const organisations = await organisationsRepository.findAll()

  let registrationsProcessed = 0
  let ledgersBackfilled = 0
  let ledgersSkippedComplete = 0
  let submissionsBackfilled = 0
  let summaryLogRowStateWrites = 0
  const orphanedAccreditations = []

  for (const organisation of organisations) {
    for (const registration of organisation.registrations) {
      const result = await backfillRegistrationLedger({
        organisation,
        registration,
        organisationsRepository,
        wasteRecordsRepository,
        summaryLogsRepository,
        overseasSitesRepository,
        summaryLogRowStateRepository,
        summaryLogRowStatesBackfillWatermarkRepository
      })
      if (result) {
        if ('orphanedAccreditation' in result) {
          orphanedAccreditations.push(result.orphanedAccreditation)
        } else if ('skippedComplete' in result) {
          ledgersSkippedComplete += 1
        } else {
          ledgersBackfilled += 1
          submissionsBackfilled += result.submissionsCommitted
          summaryLogRowStateWrites += result.summaryLogRowStateWriteCount
        }
      }
      registrationsProcessed += 1
      onProgress({
        registrationsProcessed,
        organisationId: organisation.id,
        registrationId: registration.id,
        ledgersBackfilled,
        ledgersSkippedComplete,
        submissionsBackfilled,
        summaryLogRowStateWrites,
        orphanedAccreditations: orphanedAccreditations.length
      })
    }
  }

  return {
    organisationsScanned: organisations.length,
    ledgersBackfilled,
    ledgersSkippedComplete,
    submissionsBackfilled,
    summaryLogRowStateWrites,
    orphanedAccreditations
  }
}
