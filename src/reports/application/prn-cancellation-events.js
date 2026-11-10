import { logger } from '#common/helpers/logging/logger.js'
import {
  auditMarkReportsStale,
  MARK_STALE_ACTION
} from '#reports/application/audit.js'
import { CADENCE } from '#reports/domain/cadence.js'
import { periodForDate } from '#reports/domain/period-for-date.js'

/**
 * @import { RegistrationKey, ReportsRepository } from '#reports/repository/port.js'
 * @import { SystemLogsRepository } from '#repositories/system-logs/port.js'
 */

/**
 * @typedef {{
 *   reportsRepository: ReportsRepository,
 *   systemLogsRepository: SystemLogsRepository
 * }} PrnCancelledRepositories
 *
 * @typedef {RegistrationKey & {
 *   prnId: string,
 *   issuedAt: string
 * }} PrnCancelledParams
 *
 * @typedef {(params: PrnCancelledParams) => Promise<void>} OnPrnCancelled
 */

/**
 * Builds the PRN-cancelled handler, closing over the repositories that stay
 * fixed for the server's lifetime. The returned handler is called after a
 * PRN transitions to `awaiting_cancellation`: it computes the reporting
 * period the PRN's issuance date falls into, then marks that period's active
 * (in_progress / ready_to_submit) report stale — the PRN-cancellation
 * counterpart to `onSummaryLogUploaded`. A PRN can only be issued by an
 * accredited operator, so the cadence is always monthly here — no
 * registration lookup needed. A no-op if the period has no active report.
 *
 * @param {PrnCancelledRepositories} repositories
 * @returns {OnPrnCancelled}
 */
export const createOnPrnCancelled =
  ({ reportsRepository, systemLogsRepository }) =>
  async ({ organisationNumber, registrationNumber, prnId, issuedAt }) => {
    const { year, period } = periodForDate(issuedAt, CADENCE.monthly)
    const issuedPeriod = { year, cadence: CADENCE.monthly, period }

    const occurredAt = new Date().toISOString()

    logger.info({
      message: `PRN cancelled, marking reports stale for ${organisationNumber}/${registrationNumber} period ${year}-${CADENCE.monthly}-${period}: ${prnId}`
    })

    const reportsMarkedStale =
      await reportsRepository.markActiveReportsStaleForPrnCancellation({
        organisationNumber,
        registrationNumber,
        ...issuedPeriod,
        prnId,
        occurredAt
      })

    if (reportsMarkedStale.length === 0) {
      logger.info({
        message: `No active report marked stale for ${organisationNumber}/${registrationNumber} prnId=${prnId} (none active, or already flagged by an earlier trigger)`
      })
      return
    }

    logger.info({
      message: `Reports marked as stale for ${organisationNumber}/${registrationNumber} prnId=${prnId}: ${reportsMarkedStale.map((r) => r.reportId).join(', ')}`
    })

    await auditMarkReportsStale({
      systemLogsRepository,
      organisationNumber,
      registrationNumber,
      reportsMarkedStale,
      action: MARK_STALE_ACTION.PRN_CANCELLED
    })
  }
