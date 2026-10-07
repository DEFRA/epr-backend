import { startOfDay } from '#common/helpers/date-formatter.js'
import { REGISTRATION_STATUS } from '#domain/organisations/model.js'
import { auditSummaryLogYearBackfill } from './audit.js'

/** @import { TypedLogger } from '#common/hapi-types.js' */
/** @import { OrganisationsRepository } from '#repositories/organisations/port.js' */
/** @import { SummaryLogsRepository } from '#repositories/summary-logs/port.js' */
/** @import { SystemLogsRepository } from '#repositories/system-logs/port.js' */

/**
 * @typedef {Object} BackfillResult
 * @property {number} legacy - summary logs without a year when the run started
 * @property {number} updated
 * @property {number} failed - not written; retried on the next run
 * @property {number} auditFailed - written but not audited; never listed again
 * @property {Record<number, number>} years - summary logs per derived year (would be, on a dry run)
 */

/** @param {{ year?: number | null }} summaryLog */
const hasYear = ({ year }) => year !== undefined && year !== null

/**
 * The earliest approval in a registration's status history, as a year.
 *
 * @param {{ status: string, updatedAt: Date | string }[] | undefined} statusHistory
 * @returns {number | undefined}
 */
const firstApprovalYear = (statusHistory = []) => {
  const approvals = statusHistory
    .filter(({ status }) => status === REGISTRATION_STATUS.APPROVED)
    .map(({ updatedAt }) => new Date(updatedAt))
    .sort((a, b) => a.getTime() - b.getTime())
  return approvals[0]?.getUTCFullYear()
}

/**
 * The registration's start year, matching the year the year-scoped routes
 * are called with. A cancelled registration can have lost its `validFrom`, so
 * its first approval in the status history stands in for it.
 *
 * @param {OrganisationsRepository} organisationsRepository
 * @param {{ organisationId?: string, registrationId?: string }} summaryLog
 * @returns {Promise<number>}
 */
const registrationStartYear = async (
  organisationsRepository,
  { organisationId, registrationId }
) => {
  if (!organisationId || !registrationId) {
    throw new Error('Summary log has no organisation or registration')
  }
  const { validFrom, statusHistory } =
    await organisationsRepository.findRegistrationById(
      organisationId,
      registrationId
    )
  if (validFrom) {
    return startOfDay(validFrom).getUTCFullYear()
  }
  const approvalYear = firstApprovalYear(statusHistory)
  if (approvalYear === undefined) {
    throw new Error(
      `Registration ${registrationId} has no validFrom or approval in its status history`
    )
  }
  return approvalYear
}

/**
 * Each summary log is read at its current version, given its registration's
 * start year through the repository's version check, then audited. A failure
 * before the write is logged and leaves that summary log for the next run.
 * Once written it is never listed again, so an audit failure is logged with
 * both versions for reconciliation and counted apart from write failures.
 *
 * @param {{
 *   summaryLogsRepository: SummaryLogsRepository,
 *   systemLogsRepository: SystemLogsRepository,
 *   organisationsRepository: OrganisationsRepository
 * }} repositories
 * @param {string} id
 * @param {boolean} isDryRun
 * @param {TypedLogger} logger
 * @returns {Promise<{ year: number, auditFailed: boolean } | null>} null if skipped
 */
const backfillOne = async (
  { summaryLogsRepository, systemLogsRepository, organisationsRepository },
  id,
  isDryRun,
  logger
) => {
  const before = await summaryLogsRepository.findById(id)
  if (!before || hasYear(before.summaryLog)) {
    return null
  }

  const year = await registrationStartYear(
    organisationsRepository,
    before.summaryLog
  )
  if (isDryRun) {
    return { year, auditFailed: false }
  }

  await summaryLogsRepository.assignYear(id, before.version, year)

  const next = { year, version: before.version + 1 }
  try {
    await auditSummaryLogYearBackfill(systemLogsRepository, {
      summaryLogId: id,
      organisationId: before.summaryLog.organisationId,
      registrationId: before.summaryLog.registrationId,
      previous: { year: before.summaryLog.year, version: before.version },
      next
    })
  } catch (error) {
    logger.error({
      err: error,
      message: `Year written but audit failed for summary log ${id}: year ${before.summaryLog.year} -> ${next.year}, version ${before.version} -> ${next.version}`
    })
    return { year, auditFailed: true }
  }

  return { year, auditFailed: false }
}

const FAILED = Symbol('failed')

/**
 * Failures are logged and swallowed so one bad summary log never stops the sweep.
 *
 * @param {Parameters<typeof backfillOne>[0]} repositories
 * @param {string} id
 * @param {boolean} isDryRun
 * @param {TypedLogger} logger
 */
const backfillOneSafely = async (repositories, id, isDryRun, logger) => {
  try {
    return await backfillOne(repositories, id, isDryRun, logger)
  } catch (error) {
    logger.error({
      err: error,
      message: `Failed to backfill year for summary log ${id}`
    })
    return FAILED
  }
}

/**
 * @param {{
 *   summaryLogsRepository: SummaryLogsRepository,
 *   systemLogsRepository: SystemLogsRepository,
 *   organisationsRepository: OrganisationsRepository,
 *   logger: TypedLogger
 * }} deps
 * @param {{ isDryRun: boolean }} options
 * @returns {Promise<BackfillResult>}
 */
export const backfillSummaryLogYear = async (
  { logger, ...repositories },
  { isDryRun }
) => {
  const ids = await repositories.summaryLogsRepository.findIdsWithoutYear()

  /** @type {Record<number, number>} */
  const years = {}
  let failed = 0
  let auditFailed = 0

  for (const id of ids) {
    const outcome = await backfillOneSafely(repositories, id, isDryRun, logger)
    if (outcome === FAILED) {
      failed++
      continue
    }
    if (outcome !== null) {
      years[outcome.year] = (years[outcome.year] ?? 0) + 1
      auditFailed += outcome.auditFailed ? 1 : 0
    }
  }

  const resolved = Object.values(years).reduce((sum, n) => sum + n, 0)
  return {
    legacy: ids.length,
    updated: isDryRun ? 0 : resolved,
    failed,
    auditFailed,
    years
  }
}
