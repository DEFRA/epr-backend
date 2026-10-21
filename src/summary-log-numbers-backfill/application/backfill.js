import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'

import { numbersForSummaryLog } from '#domain/summary-logs/numbers.js'
import { SUMMARY_LOG_STATUS } from '#domain/summary-logs/status.js'
import { auditSummaryLogNumbersBackfill } from './audit.js'

/** @import { TypedLogger } from '#common/hapi-types.js' */
/** @import { SummaryLog } from '#domain/summary-logs/model.js' */
/** @import { SummaryLogNumbers } from '#domain/summary-logs/numbers.js' */
/** @import { SummaryLogStatus } from '#domain/summary-logs/status.js' */
/** @import { OrganisationsRepository } from '#repositories/organisations/port.js' */
/** @import { SummaryLogsRepository } from '#repositories/summary-logs/port.js' */
/** @import { SystemLogsRepository } from '#repositories/system-logs/port.js' */

/**
 * @typedef {Object} BackfillResult
 * @property {number} missing - summary logs lacking a number when the run started
 * @property {number} inFlight - left for a later run while a worker may be writing them
 * @property {number} mapped - given at least one number (would be, on a dry run)
 * @property {number} unmapped - left lacking a number, each logged with the reason
 * @property {number} failed - not written; retried on the next run
 * @property {number} auditFailed - written but not audited
 */

/**
 * @typedef {Object} Repositories
 * @property {SummaryLogsRepository} summaryLogsRepository
 * @property {SystemLogsRepository} systemLogsRepository
 * @property {OrganisationsRepository} organisationsRepository
 */

/**
 * A worker writes these summary logs back at the version it read, so a
 * version bump here would fail its write. Each settles or expires.
 *
 * @type {ReadonlySet<SummaryLogStatus>}
 */
const IN_FLIGHT_STATUSES = new Set([
  SUMMARY_LOG_STATUS.PREPROCESSING,
  SUMMARY_LOG_STATUS.VALIDATING,
  SUMMARY_LOG_STATUS.SUBMITTING
])

/**
 * @param {OrganisationsRepository} organisationsRepository
 * @param {SummaryLog} summaryLog
 * @returns {Promise<{ numbers: SummaryLogNumbers, unmapped: string[] }>}
 */
const lookUpNumbers = async (
  organisationsRepository,
  { organisationId, registrationId, accreditationId }
) => {
  if (!organisationId || !registrationId) {
    return {
      numbers: {},
      unmapped: ['summary log holds no organisation or registration id']
    }
  }

  try {
    const organisation = await organisationsRepository.findById(organisationId)
    return numbersForSummaryLog(organisation, {
      registrationId,
      accreditationId
    })
  } catch (error) {
    if (Boom.isBoom(error, StatusCodes.NOT_FOUND)) {
      return {
        numbers: {},
        unmapped: [`organisation ${organisationId} not found`]
      }
    }
    throw error
  }
}

/**
 * @param {SummaryLogNumbers} numbers
 * @param {SummaryLog} summaryLog
 * @returns {SummaryLogNumbers}
 */
const numbersLacking = (numbers, summaryLog) =>
  Object.fromEntries(
    Object.entries(numbers).filter(([key]) => summaryLog[key] === undefined)
  )

/**
 * @param {string} id
 * @param {SummaryLog} summaryLog
 * @param {string[]} unmapped
 * @param {TypedLogger} logger
 */
const reportUnmapped = (
  id,
  { status, organisationId, registrationId, accreditationId },
  unmapped,
  logger
) => {
  logger.info({
    message: `Summary log numbers unmapped: summaryLogId=${id} status=${status} organisationId=${organisationId} registrationId=${registrationId} accreditationId=${accreditationId} reasons="${unmapped.join('; ')}"`
  })
}

/**
 * Each summary log is read at its current version, given the numbers it
 * lacks through the repository's version check, then audited. Once written,
 * an audit failure is logged with the numbers and versions for
 * reconciliation and counted apart from write failures.
 *
 * @param {Repositories} repositories
 * @param {string} id
 * @param {boolean} isDryRun
 * @param {TypedLogger} logger
 * @returns {Promise<{ inFlight: boolean, mapped: boolean, unmapped: boolean, auditFailed: boolean } | null>} null if gone
 */
const backfillOne = async (
  { summaryLogsRepository, systemLogsRepository, organisationsRepository },
  id,
  isDryRun,
  logger
) => {
  const before = await summaryLogsRepository.findById(id)
  if (!before) {
    return null
  }
  const { summaryLog, version } = before
  if (IN_FLIGHT_STATUSES.has(summaryLog.status)) {
    return {
      inFlight: true,
      mapped: false,
      unmapped: false,
      auditFailed: false
    }
  }

  const { numbers, unmapped } = await lookUpNumbers(
    organisationsRepository,
    summaryLog
  )
  if (unmapped.length > 0) {
    reportUnmapped(id, summaryLog, unmapped, logger)
  }

  const lacking = numbersLacking(numbers, summaryLog)
  const outcome = {
    inFlight: false,
    mapped: Object.keys(lacking).length > 0,
    unmapped: unmapped.length > 0,
    auditFailed: false
  }
  if (!outcome.mapped || isDryRun) {
    return outcome
  }

  await summaryLogsRepository.assignNumbers(id, version, lacking)

  try {
    await auditSummaryLogNumbersBackfill(systemLogsRepository, {
      summaryLogId: id,
      organisationId: summaryLog.organisationId,
      registrationId: summaryLog.registrationId,
      accreditationId: summaryLog.accreditationId,
      previous: { version },
      next: { ...lacking, version: version + 1 }
    })
  } catch (error) {
    logger.error({
      err: error,
      message: `Numbers written but audit failed for summary log ${id}: ${JSON.stringify(lacking)}, version ${version} -> ${version + 1}`
    })
    return { ...outcome, auditFailed: true }
  }

  return outcome
}

/**
 * Adds to each summary log the organisation, registration and accreditation
 * numbers it lacks, read from its organisation record. Logs one line for
 * each summary log it cannot fully map, saying why. A failure is logged and
 * swallowed so one bad summary log never stops the sweep.
 *
 * @param {Repositories & { logger: TypedLogger }} deps
 * @param {{ isDryRun: boolean }} options
 * @returns {Promise<BackfillResult>}
 */
export const backfillSummaryLogNumbers = async (
  { logger, ...repositories },
  { isDryRun }
) => {
  const ids = await repositories.summaryLogsRepository.findIdsWithoutNumbers()
  const result = {
    missing: ids.length,
    inFlight: 0,
    mapped: 0,
    unmapped: 0,
    failed: 0,
    auditFailed: 0
  }

  for (const id of ids) {
    try {
      const outcome = await backfillOne(repositories, id, isDryRun, logger)
      if (outcome) {
        result.inFlight += Number(outcome.inFlight)
        result.mapped += Number(outcome.mapped)
        result.unmapped += Number(outcome.unmapped)
        result.auditFailed += Number(outcome.auditFailed)
      }
    } catch (error) {
      logger.error({
        err: error,
        message: `Failed to backfill numbers for summary log ${id}`
      })
      result.failed++
    }
  }

  return result
}
