import { logger } from '#common/helpers/logging/logger.js'
import { createOrganisationsRepository } from '#repositories/organisations/mongodb.js'
import { diagnoseStreamTransitions } from '#stream-transition-diagnostic/application/diagnose-stream-transitions.js'
import { diagnoseRegAccStatus } from '#stream-transition-diagnostic/application/diagnose-reg-acc-status.js'
import { createStreamUsageQuery } from '#stream-transition-diagnostic/repository/stream-usage-query.mongodb.js'

import { config } from '../config.js'

/** @import { StartedServer } from '#common/hapi-types.js' */
/** @import { StreamTransitionReport } from '#stream-transition-diagnostic/application/diagnose-stream-transitions.js' */
/** @import { RegAccStatusReport } from '#stream-transition-diagnostic/application/diagnose-reg-acc-status.js' */

const LOCK_NAME = 'stream-transition-diagnostic'

/** @param {StreamTransitionReport} r */
const formatTransitionLine = (r) =>
  [
    'Stream transition:',
    `organisationId=${r.organisationId}`,
    `orgId=${r.orgId}`,
    `orgName="${r.orgName}"`,
    `registrationId=${r.registrationId}`,
    `registrationNumber=${r.registrationNumber}`,
    `accreditationId=${r.accreditationId}`,
    `accreditationNumber=${r.accreditationNumber}`,
    `direction=${r.direction}`,
    `registeredOnlySubmissions=${r.registeredOnlySubmissions}`,
    `accreditedSubmissions=${r.accreditedSubmissions}`,
    `registeredOnlyLastSubmittedAt=${r.registeredOnlyLastSubmittedAt}`,
    `accreditedFirstSubmittedAt=${r.accreditedFirstSubmittedAt}`,
    `registrationHistory="${r.registrationHistory}"`,
    `accreditationHistory="${r.accreditationHistory}"`,
    `material=${r.material}`
  ].join(' ')

const LINE_PREFIX = {
  currentlySuspended: 'Reg/acc currently suspended:',
  currentlyCancelled: 'Reg/acc currently cancelled:',
  previously: 'Reg/acc previously suspended or cancelled:'
}

/** @param {RegAccStatusReport} r */
const formatRegAccStatusLine = (r) => {
  const fields = [
    LINE_PREFIX[r.line],
    `organisationId=${r.organisationId}`,
    `orgId=${r.orgId}`,
    `orgName="${r.orgName}"`,
    `kind=${r.kind}`,
    `registrationId=${r.registrationId ?? 'none'}`,
    `registrationNumber=${r.registrationNumber ?? 'none'}`,
    `accreditationId=${r.accreditationId ?? 'none'}`,
    `accreditationNumber=${r.accreditationNumber ?? 'none'}`
  ]

  if (r.line === 'previously') {
    fields.push(`currentStatus=${r.currentStatus}`)
  }

  fields.push(
    `suspensionCount=${r.suspensionCount}`,
    `cancellationCount=${r.cancellationCount}`,
    `registrationHistory="${r.registrationHistory}"`,
    `accreditationHistory="${r.accreditationHistory}"`,
    `material=${r.material}`
  )

  return fields.join(' ')
}

/** @param {StartedServer} server */
const runDiagnostic = async (server) => {
  const repository = (await createOrganisationsRepository(server.db))()
  const streamUsageQuery = createStreamUsageQuery(server.db)

  const [organisations, streamUsage] = await Promise.all([
    repository.findAll(),
    streamUsageQuery()
  ])

  const { reports: transitionReports, summary: transitionSummary } =
    diagnoseStreamTransitions(streamUsage, organisations)

  for (const report of transitionReports) {
    logger.info({ message: formatTransitionLine(report) })
  }

  logger.info({
    message: `Stream transition diagnostic: scanned=${transitionSummary.scanned} affectedOrganisations=${transitionSummary.affectedOrganisations} registeredToAccredited=${transitionSummary.registeredToAccredited} accreditedToRegistered=${transitionSummary.accreditedToRegistered} registeredOnlySubmissions=${transitionSummary.registeredOnlySubmissions} accreditedSubmissions=${transitionSummary.accreditedSubmissions}`
  })

  const { reports: statusReports, summary: statusSummary } =
    diagnoseRegAccStatus(organisations)

  for (const report of statusReports) {
    logger.info({ message: formatRegAccStatusLine(report) })
  }

  logger.info({
    message: `Reg/acc status diagnostic: organisations=${statusSummary.organisations} currentlySuspendedAccreditations=${statusSummary.currentlySuspendedAccreditations} currentlyCancelledAccreditations=${statusSummary.currentlyCancelledAccreditations} currentlyCancelledRegistrations=${statusSummary.currentlyCancelledRegistrations} previouslySuspendedNowApproved=${statusSummary.previouslySuspendedNowApproved} previouslyCancelledNowApproved=${statusSummary.previouslyCancelledNowApproved} totalSuspensionEvents=${statusSummary.totalSuspensionEvents} totalCancellationEvents=${statusSummary.totalCancellationEvents}`
  })
}

/**
 * Read-only startup diagnostic for PAE-1924: sizes how many operators have
 * switched between the registered-only and accredited summary-log streams
 * (ADR 0048), and separately reports every registration/accreditation that
 * has ever been suspended or cancelled, including ones since reverted to
 * approved that a current-status check would miss.
 *
 * Unlike the sibling sweeps this job gates on its flag BEFORE acquiring the
 * lock: it has no dry-run/repair duality, so a flag-off pod should do no
 * database work at all rather than sweep with nothing to report.
 *
 * @param {StartedServer} server - Hapi server instance
 */
export const runStreamTransitionDiagnostic = async (server) => {
  if (!config.get('featureFlags.streamTransitionDiagnostic')) {
    return
  }

  try {
    const lock = await server.locker.lock(LOCK_NAME)
    if (!lock) {
      logger.info({
        message: 'Unable to obtain lock, skipping stream transition diagnostic'
      })
      return
    }
    try {
      await runDiagnostic(server)
    } finally {
      await lock.free()
    }
  } catch (error) {
    logger.error({
      err: error,
      message: 'Failed to run stream transition diagnostic'
    })
  }
}
