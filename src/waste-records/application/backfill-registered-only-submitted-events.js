import { resolveOverseasSites } from '#application/waste-records/resolve-overseas-sites.js'
import { SUMMARY_LOG_STATUS } from '#domain/summary-logs/status.js'
import { buildSystemLogSubmitters } from '#waste-balances/application/summary-log-submitters.js'
import {
  BACKFILL_ACTOR,
  LEDGER_EVENT_KIND
} from '#waste-balances/repository/ledger-schema.js'
import { reconstructSubmissionSummaryLogRowStates } from '#waste-records/backfill/reconstruct-submission-summary-log-row-states.js'

/**
 * @import { SummaryLogWithId } from '#repositories/summary-logs/port.js'
 * @import { OrderedSummaryLog } from '#waste-records/backfill/reconstruct-submission-summary-log-row-states.js'
 * @import { WasteBalanceLedgerRepository } from '#waste-balances/repository/ledger-port.js'
 */

/**
 * A registered-only summary-log submitted event the sweep emits — or, in a
 * dry-run, would emit: the zero-delta event's summary log, its original
 * provenance, and the head-anchored row membership the submission resolves to.
 *
 * @typedef {Object} PlannedSubmittedEvent
 * @property {string} summaryLogId
 * @property {string} submittedAt - ISO8601 timestamp
 * @property {import('#waste-balances/repository/ledger-schema.js').LedgerUserSummary} [submittedBy]
 * @property {string[]} membershipRowIds
 */

/**
 * A registered-only registration's slice of the sweep plan: the submitted events
 * it emitted, or under dry-run would emit, so the reviewer sees per-registration
 * exactly what an execute run writes before the flag is flipped.
 *
 * @typedef {Object} RegisteredOnlyPlan
 * @property {string} organisationId
 * @property {string} registrationId
 * @property {PlannedSubmittedEvent[]} plannedEvents
 */

/**
 * What the registered-only submitted-events sweep emitted — or, under dry-run,
 * would emit — for migration logging.
 *
 * @typedef {Object} RegisteredOnlySweepSummary
 * @property {number} organisationsScanned
 * @property {number} registrationsScanned - Registered-only registrations with at least one submitted summary log
 * @property {number} submissionsScanned - Submitted summary logs replayed across them
 * @property {number} submittedEventWrites - Zero-delta submitted events emitted, or (dry-run) planned
 * @property {RegisteredOnlyPlan[]} registeredOnlyPlan
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
 * @param {Map<string, import('#waste-balances/repository/ledger-schema.js').LedgerUserSummary>} submitters
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
 * The submitted summary logs for one registration, in the order the reconstruct
 * step replays them, each carrying the recovered original submitter (keyed by
 * `file.id`) when the submit audit yielded one. Only submitted logs are kept,
 * mirroring the live write scope; drafts and in-flight submissions are dropped.
 *
 * @param {Object} args
 * @param {import('#repositories/summary-logs/port.js').SummaryLogsRepository} args.summaryLogsRepository
 * @param {import('#repositories/system-logs/port.js').SystemLogsRepository} args.systemLogsRepository
 * @param {string} args.organisationId
 * @param {string} args.registrationId
 * @returns {Promise<OrderedSummaryLog[]>}
 */
const loadSubmittedSummaryLogs = async ({
  summaryLogsRepository,
  systemLogsRepository,
  organisationId,
  registrationId
}) => {
  const logs = await summaryLogsRepository.findAllByOrgReg(
    organisationId,
    registrationId
  )
  const submitActors = await systemLogsRepository.findSummaryLogSubmitActors(
    logs.map((log) => String(log.id))
  )
  const submitters = buildSystemLogSubmitters({
    submitActors,
    summaryLogDocs: logs
  })
  return logs
    .filter((log) => log.summaryLog.status === SUMMARY_LOG_STATUS.SUBMITTED)
    .map((log) => toOrderedSummaryLog(log, submitters))
}

/**
 * The summary-log ids of registered-only summary-log submitted events already
 * present in a registered-only ledger, so a re-run never double-emits.
 *
 * @param {WasteBalanceLedgerRepository} ledgerRepository
 * @param {string} registrationId
 * @returns {Promise<Set<string>>}
 */
const existingSubmittedEventSummaryLogIds = async (
  ledgerRepository,
  registrationId
) => {
  const events = await ledgerRepository.findAllInLedger(registrationId, null)
  return new Set(
    events
      .filter((event) => event.kind === LEDGER_EVENT_KIND.SUMMARY_LOG_SUBMITTED)
      .map(
        (event) =>
          /** @type {import('#waste-balances/repository/ledger-schema.js').SummaryLogSubmittedPayload} */ (
            event.payload
          ).summaryLogId
      )
  )
}

/**
 * Emit the missing zero-delta `summary-log-submitted` events for one
 * registered-only registration. Reconstructs each submission's membership in
 * stream order for the plan, then for every submission that has no submitted
 * event yet appends a balance-neutral event dated its original `submittedAt` and
 * attributed to the recovered submitter (or the backfill actor when none was
 * recovered). Emission is idempotent — a submission that already has an event is
 * skipped — so a re-run emits nothing.
 *
 * @param {Object} args
 * @param {import('#domain/organisations/model.js').Organisation} args.organisation
 * @param {import('#domain/organisations/registration.js').Registration} args.registration
 * @param {import('#repositories/organisations/port.js').OrganisationsRepository} args.organisationsRepository
 * @param {import('#repositories/waste-records/port.js').WasteRecordsRepository} args.wasteRecordsRepository
 * @param {import('#repositories/summary-logs/port.js').SummaryLogsRepository} args.summaryLogsRepository
 * @param {import('#overseas-sites/repository/port.js').OverseasSitesRepository} args.overseasSitesRepository
 * @param {import('#repositories/system-logs/port.js').SystemLogsRepository} args.systemLogsRepository
 * @param {WasteBalanceLedgerRepository} args.ledgerRepository
 * @param {ReturnType<typeof import('#waste-balances/application/waste-balance-service.js').createWasteBalanceService>} args.wasteBalanceService
 * @param {boolean} args.writeSubmittedEvents
 * @returns {Promise<{ submissionCount: number, plannedEvents: PlannedSubmittedEvent[] } | null>}
 */
const backfillRegistrationSubmittedEvents = async ({
  organisation,
  registration,
  organisationsRepository,
  wasteRecordsRepository,
  summaryLogsRepository,
  overseasSitesRepository,
  systemLogsRepository,
  ledgerRepository,
  wasteBalanceService,
  writeSubmittedEvents
}) => {
  const summaryLogs = await loadSubmittedSummaryLogs({
    summaryLogsRepository,
    systemLogsRepository,
    organisationId: organisation.id,
    registrationId: registration.id
  })
  if (summaryLogs.length === 0) {
    return null
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

  const submissions = reconstructSubmissionSummaryLogRowStates({
    wasteRecords,
    summaryLogs,
    accreditation: null,
    overseasSites
  })

  const existingSubmittedEvents = await existingSubmittedEventSummaryLogIds(
    ledgerRepository,
    registration.id
  )

  /** @type {PlannedSubmittedEvent[]} */
  const plannedEvents = []
  for (const {
    summaryLogId,
    entries,
    submittedAt,
    submittedBy
  } of submissions) {
    if (existingSubmittedEvents.has(summaryLogId)) {
      continue
    }
    if (writeSubmittedEvents) {
      await wasteBalanceService.commitSummaryLogSubmittedEvent(
        {
          registrationId: registration.id,
          accreditationId: null,
          organisationId: organisation.id
        },
        { summaryLogId, creditTotal: 0 },
        submittedBy ?? BACKFILL_ACTOR,
        new Date(submittedAt)
      )
    }
    existingSubmittedEvents.add(summaryLogId)
    plannedEvents.push({
      summaryLogId,
      submittedAt,
      ...(submittedBy && { submittedBy }),
      membershipRowIds: entries.map((entry) => entry.rowId)
    })
  }

  return { submissionCount: submissions.length, plannedEvents }
}

/**
 * Reconstruct and replay the registered-only historical strand: for every
 * registered-only (null-accreditation) registration with submitted summary logs,
 * emit the balance-neutral zero-delta `summary-log-submitted` event each
 * submission never formed on the live path, so the registration's latest state
 * reads through the head-anchored read model. Accredited registrations keep the
 * events their original processing wrote and are skipped here.
 *
 * `writeSubmittedEvents` false runs a fully read-only dry-run: it reconstructs
 * and reads exactly as an execute would, but appends nothing — the returned
 * `registeredOnlyPlan` still describes what an execute would write, the
 * reviewable evidence a rollout gates on. Emission is idempotent through the
 * existing-event check, so a re-run writes nothing new.
 *
 * @param {Object} deps
 * @param {import('#repositories/organisations/port.js').OrganisationsRepository} deps.organisationsRepository
 * @param {import('#repositories/waste-records/port.js').WasteRecordsRepository} deps.wasteRecordsRepository
 * @param {import('#repositories/summary-logs/port.js').SummaryLogsRepository} deps.summaryLogsRepository
 * @param {import('#overseas-sites/repository/port.js').OverseasSitesRepository} deps.overseasSitesRepository
 * @param {import('#repositories/system-logs/port.js').SystemLogsRepository} deps.systemLogsRepository
 * @param {WasteBalanceLedgerRepository} deps.ledgerRepository
 * @param {ReturnType<typeof import('#waste-balances/application/waste-balance-service.js').createWasteBalanceService>} deps.wasteBalanceService
 * @param {boolean} [deps.writeSubmittedEvents] - When false, plan the events without appending them (dry-run)
 * @returns {Promise<RegisteredOnlySweepSummary>}
 */
export const backfillRegisteredOnlySubmittedEvents = async ({
  organisationsRepository,
  wasteRecordsRepository,
  summaryLogsRepository,
  overseasSitesRepository,
  systemLogsRepository,
  ledgerRepository,
  wasteBalanceService,
  writeSubmittedEvents = true
}) => {
  const organisations = await organisationsRepository.findAll()

  let registrationsScanned = 0
  let submissionsScanned = 0
  let submittedEventWrites = 0
  /** @type {RegisteredOnlyPlan[]} */
  const registeredOnlyPlan = []

  for (const organisation of organisations) {
    const registeredOnlyRegistrations = organisation.registrations.filter(
      (registration) => (registration.accreditationId ?? null) === null
    )
    for (const registration of registeredOnlyRegistrations) {
      const result = await backfillRegistrationSubmittedEvents({
        organisation,
        registration,
        organisationsRepository,
        wasteRecordsRepository,
        summaryLogsRepository,
        overseasSitesRepository,
        systemLogsRepository,
        ledgerRepository,
        wasteBalanceService,
        writeSubmittedEvents
      })
      if (!result) {
        continue
      }
      registrationsScanned += 1
      submissionsScanned += result.submissionCount
      submittedEventWrites += result.plannedEvents.length
      if (result.plannedEvents.length > 0) {
        registeredOnlyPlan.push({
          organisationId: organisation.id,
          registrationId: registration.id,
          plannedEvents: result.plannedEvents
        })
      }
    }
  }

  return {
    organisationsScanned: organisations.length,
    registrationsScanned,
    submissionsScanned,
    submittedEventWrites,
    registeredOnlyPlan
  }
}
