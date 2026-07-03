import { logger } from '#common/helpers/logging/logger.js'
import {
  addAttribution,
  formatAttributionMatrix
} from '#waste-balances/application/summary-log-submitters.js'
import { STREAM_EVENT_KIND } from '#waste-balances/repository/stream-schema.js'
import { backfillRegisteredOnlySubmittedEvents } from '#waste-records/application/backfill-registered-only-submitted-events.js'

/**
 * @import { PlannedSubmittedEvent } from '#waste-records/application/backfill-registered-only-submitted-events.js'
 * @import { AttributionMatrix } from '#waste-balances/application/summary-log-submitters.js'
 */

const LOCK_NAME = 'registered-only-submitted-events-backfill'

/**
 * The provenance of the actor an event is attributed to, id-only so no name or
 * email token reaches the log (CDP masks those as potential PII). An event with
 * no recovered submitter falls back to the `backfill` sentinel.
 *
 * @param {PlannedSubmittedEvent['submittedBy']} [submittedBy]
 */
const formatActor = (submittedBy) =>
  submittedBy ? `recovered(id=${submittedBy.id})` : 'backfill'

/**
 * @param {AttributionMatrix} matrix
 */
const hasUnattributedEvent = (matrix) =>
  Object.values(matrix).some((counts) => counts.noActor > 0)

/**
 * Log what the sweep emitted, or under dry-run would emit: one line per planned
 * event carrying its summary log, original date, actor provenance and
 * head-anchored membership; a per-registration warning when any event falls back
 * to backfill attribution; and an aggregate attribution matrix, so the
 * recovered-vs-backfill split is reviewable before the flag is flipped — the same
 * attribution accounting the waste-balance ledger backfill used.
 *
 * @param {Object} server - Hapi server instance
 * @param {boolean} writeSubmittedEvents - Emit the events (execute), or skip them (dry-run)
 */
const runBackfill = async (server, writeSubmittedEvents) => {
  const summary = await backfillRegisteredOnlySubmittedEvents({
    organisationsRepository: server.app.organisationsRepository,
    wasteRecordsRepository: server.app.wasteRecordsRepository,
    summaryLogsRepository: server.app.summaryLogsRepository,
    overseasSitesRepository: server.app.overseasSitesRepository,
    systemLogsRepository: server.app.systemLogsRepository,
    streamRepository: server.app.streamRepository,
    wasteBalanceService: server.app.wasteBalanceService,
    writeSubmittedEvents
  })

  const dryRun = !writeSubmittedEvents
  const verb = dryRun ? 'would emit' : 'emitted'
  /** @type {AttributionMatrix} */
  const totals = {}
  for (const {
    organisationId,
    registrationId,
    plannedEvents
  } of summary.registeredOnlyPlan) {
    /** @type {AttributionMatrix} */
    const matrix = {}
    for (const {
      summaryLogId,
      submittedAt,
      submittedBy,
      membershipRowIds
    } of plannedEvents) {
      logger.info({
        message: `Registered-only submitted-events backfill ${verb}: organisationId=${organisationId} registrationId=${registrationId} summaryLogId=${summaryLogId} submittedAt=${submittedAt} actor=${formatActor(submittedBy)} membership=[${membershipRowIds.join(',')}]`
      })
      addAttribution(
        matrix,
        STREAM_EVENT_KIND.SUMMARY_LOG_SUBMITTED,
        submittedBy
      )
      addAttribution(
        totals,
        STREAM_EVENT_KIND.SUMMARY_LOG_SUBMITTED,
        submittedBy
      )
    }
    if (hasUnattributedEvent(matrix)) {
      logger.warn({
        message: `Registered-only submitted-events backfill has unattributed events: organisationId=${organisationId} registrationId=${registrationId} attributionMatrix=${formatAttributionMatrix(matrix)}`
      })
    }
  }

  const outcome = dryRun ? 'dry-run complete (no writes)' : 'complete'
  logger.info({
    message: `Registered-only submitted-events backfill ${outcome}: organisationsScanned=${summary.organisationsScanned} registrationsScanned=${summary.registrationsScanned} submissionsScanned=${summary.submissionsScanned} submittedEventWrites=${summary.submittedEventWrites} registeredOnlyRegistrations=${summary.registeredOnlyPlan.length} attributionMatrix=${formatAttributionMatrix(totals)}`
  })
}

/**
 * Reconstructs and replays the registered-only historical strand at startup.
 * `FEATURE_FLAG_REGISTERED_ONLY_SUBMITTED_EVENTS` off runs a fully read-only
 * dry-run — it reconstructs and reads exactly as an execute would but appends
 * nothing, logging per registration the zero-delta events it would emit and their
 * attribution, the reviewable evidence a rollout gates on. Flipping the flag on
 * executes the writes; emission is idempotent, so a re-run appends nothing new.
 *
 * Runs under a cross-instance lock in both modes so one pod per deploy performs
 * the sweep. Failures are logged, never thrown, so a backfill problem cannot
 * block the server from starting.
 *
 * @param {Object} server - Hapi server instance
 */
export const runRegOnlySubmittedEventsBackfill = async (server) => {
  const writeSubmittedEvents =
    server.featureFlags.isRegisteredOnlySubmittedEventsEnabled()

  try {
    const lock = await server.locker.lock(LOCK_NAME)
    if (!lock) {
      logger.info({
        message:
          'Unable to obtain lock, skipping registered-only submitted-events backfill'
      })
      return
    }
    try {
      await runBackfill(server, writeSubmittedEvents)
    } finally {
      await lock.free()
    }
  } catch (error) {
    logger.error({
      err: error,
      message: 'Failed to run registered-only submitted-events backfill'
    })
  }
}
