import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'

import { resolveOverseasSites } from '#application/waste-records/resolve-overseas-sites.js'
import { SUMMARY_LOG_STATUS } from '#domain/summary-logs/status.js'
import { buildSystemLogSubmitters } from '#waste-balances/application/summary-log-submitters.js'

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
 * @property {number} submittedEventWrites - Registered-only summary-log submitted events emitted
 * @property {OrphanedAccreditation[]} orphanedAccreditations
 */

/**
 * What backfilling a single registration stream contributed: either an orphaned
 * accreditation to surface, or the submission and write counts it committed.
 * `null` means the stream was skipped (no submitted summary logs).
 *
 * @typedef {Object} StreamBackfilled
 * @property {number} submissionCount
 * @property {number} rowStateWriteCount
 * @property {number} submittedEventWriteCount
 *
 * @typedef {Object} StreamOrphaned
 * @property {OrphanedAccreditation} orphanedAccreditation
 */

/**
 * The membership key and the waste-record version tags are the summary log's
 * `file.id`, not the summary-log document id — the live write path keys both on
 * `file.id`, so the backfill must too or it reconstructs nothing. A submitted
 * summary log always carries `submittedAt` (stamped at submission), which the
 * status filter upstream guarantees is the only kind reaching this mapping. The
 * recovered original submitter (keyed by `file.id`) rides along as `submittedBy`
 * when one was found, so the replayed submitted event is attributed to the
 * person who made the submission rather than the backfill actor.
 *
 * @param {SummaryLogWithId} log
 * @param {Map<string, import('#waste-balances/repository/stream-schema.js').StreamUserSummary>} submitters
 * @returns {OrderedSummaryLog}
 */
const toOrderedSummaryLog = ({ summaryLog }, submitters) => {
  const submittedBy = submitters.get(summaryLog.file.id)
  return {
    id: summaryLog.file.id,
    status: summaryLog.status,
    submittedAt: /** @type {string} */ (summaryLog.submittedAt),
    ...(submittedBy && { submittedBy })
  }
}

/**
 * Backfill one registration's stream, mirroring the live write scope: every
 * registration with at least one submitted summary log is reconstructed,
 * partitioned by accreditation existence (`accreditationId ?? null`) and
 * classified against today's accreditation (or null for a registered-only
 * registration) and overseas-site state. A skip yields null only when there are
 * no submitted summary logs. When a registration references an accreditation that
 * is missing from the organisation, that is surfaced as orphaned rather than
 * fatal.
 *
 * @param {Object} args
 * @param {import('#domain/organisations/model.js').Organisation} args.organisation
 * @param {import('#domain/organisations/registration.js').Registration} args.registration
 * @param {import('#repositories/organisations/port.js').OrganisationsRepository} args.organisationsRepository
 * @param {import('#repositories/waste-records/port.js').WasteRecordsRepository} args.wasteRecordsRepository
 * @param {import('#repositories/summary-logs/port.js').SummaryLogsRepository} args.summaryLogsRepository
 * @param {import('#overseas-sites/repository/port.js').OverseasSitesRepository} args.overseasSitesRepository
 * @param {RowStateRepository} args.rowStateRepository
 * @param {import('#repositories/system-logs/port.js').SystemLogsRepository} args.systemLogsRepository
 * @param {import('#waste-balances/repository/stream-port.js').WasteBalanceStreamRepository} args.streamRepository
 * @param {ReturnType<typeof import('#waste-balances/application/waste-balance-service.js').createWasteBalanceService>} args.wasteBalanceService
 * @returns {Promise<StreamBackfilled | StreamOrphaned | null>}
 */
const backfillRegistrationStream = async ({
  organisation,
  registration,
  organisationsRepository,
  wasteRecordsRepository,
  summaryLogsRepository,
  overseasSitesRepository,
  rowStateRepository,
  systemLogsRepository,
  streamRepository,
  wasteBalanceService
}) => {
  const { accreditationId } = registration

  const logs = await summaryLogsRepository.findAllByOrgReg(
    organisation.id,
    registration.id
  )
  const submitActors = await systemLogsRepository.findSummaryLogSubmitActors(
    logs.map((log) => String(log.id))
  )
  const submitters = buildSystemLogSubmitters({
    submitActors,
    summaryLogDocs: logs
  })
  const summaryLogs = logs
    .filter((log) => log.summaryLog.status === SUMMARY_LOG_STATUS.SUBMITTED)
    .map((log) => toOrderedSummaryLog(log, submitters))
  if (summaryLogs.length === 0) {
    return null
  }

  let accreditation = null
  if (accreditationId) {
    try {
      accreditation = await organisationsRepository.findAccreditationById(
        organisation.id,
        accreditationId
      )
    } catch (error) {
      const statusCode = Boom.isBoom(error)
        ? error.output.statusCode
        : undefined
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

  const { submissionCount, rowStateWriteCount, submittedEventWriteCount } =
    await backfillRegistrationRowStates({
      partition: {
        organisationId: organisation.id,
        registrationId: registration.id,
        accreditationId: accreditationId ?? null
      },
      wasteRecords,
      summaryLogs,
      accreditation,
      overseasSites,
      rowStateRepository,
      streamRepository,
      wasteBalanceService
    })

  return { submissionCount, rowStateWriteCount, submittedEventWriteCount }
}

/**
 * Reconstruct the waste record state collection for the whole historical estate
 * from sparse version history, mirroring the live submission path's write scope:
 * every registration with submitted summary logs contributes — accredited and
 * registered-only alike — partitioned by accreditation existence
 * (`accreditationId ?? null`), and only submitted summary logs are replayed.
 * Accreditation validity and overseas-site approval are read at today's
 * state, so a backfilled row's classification reflects current factors — the
 * historical-reading drift ADR-0037 accepts for legacy submissions. Re-runnable:
 * every registration's upserts are idempotent. Registered-only streams, which
 * never formed a summary-log submitted event on the live path, additionally
 * receive a balance-neutral zero-delta event per submission so every submission
 * has its submitted event; emission is idempotent too. An accreditation referenced
 * by a registration but missing from the organisation is surfaced and skipped,
 * not fatal.
 *
 * @param {Object} deps
 * @param {import('#repositories/organisations/port.js').OrganisationsRepository} deps.organisationsRepository
 * @param {import('#repositories/waste-records/port.js').WasteRecordsRepository} deps.wasteRecordsRepository
 * @param {import('#repositories/summary-logs/port.js').SummaryLogsRepository} deps.summaryLogsRepository
 * @param {import('#overseas-sites/repository/port.js').OverseasSitesRepository} deps.overseasSitesRepository
 * @param {RowStateRepository} deps.rowStateRepository
 * @param {import('#repositories/system-logs/port.js').SystemLogsRepository} deps.systemLogsRepository
 * @param {import('#waste-balances/repository/stream-port.js').WasteBalanceStreamRepository} deps.streamRepository
 * @param {ReturnType<typeof import('#waste-balances/application/waste-balance-service.js').createWasteBalanceService>} deps.wasteBalanceService
 * @returns {Promise<EstateBackfillSummary>}
 */
export const backfillEstateRowStates = async ({
  organisationsRepository,
  wasteRecordsRepository,
  summaryLogsRepository,
  overseasSitesRepository,
  rowStateRepository,
  systemLogsRepository,
  streamRepository,
  wasteBalanceService
}) => {
  const organisations = await organisationsRepository.findAll()

  let streamsBackfilled = 0
  let submissionsBackfilled = 0
  let rowStateWrites = 0
  let submittedEventWrites = 0
  const orphanedAccreditations = []

  for (const organisation of organisations) {
    for (const registration of organisation.registrations) {
      const result = await backfillRegistrationStream({
        organisation,
        registration,
        organisationsRepository,
        wasteRecordsRepository,
        summaryLogsRepository,
        overseasSitesRepository,
        rowStateRepository,
        systemLogsRepository,
        streamRepository,
        wasteBalanceService
      })
      if (!result) {
        continue
      }
      if ('orphanedAccreditation' in result) {
        orphanedAccreditations.push(result.orphanedAccreditation)
      } else {
        streamsBackfilled += 1
        submissionsBackfilled += result.submissionCount
        rowStateWrites += result.rowStateWriteCount
        submittedEventWrites += result.submittedEventWriteCount
      }
    }
  }

  return {
    organisationsScanned: organisations.length,
    streamsBackfilled,
    submissionsBackfilled,
    rowStateWrites,
    submittedEventWrites,
    orphanedAccreditations
  }
}
