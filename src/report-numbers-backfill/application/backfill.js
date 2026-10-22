import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'

import { numbersFor } from '#domain/organisations/numbers.js'
import { auditReportNumbersBackfill } from '#reports/application/audit.js'

/** @import { TypedLogger } from '#common/hapi-types.js' */
/** @import { OrganisationsRepository } from '#repositories/organisations/port.js' */
/** @import { Report, ReportNumbers, ReportsRepository } from '#reports/repository/port.js' */
/** @import { SystemLogsRepository } from '#repositories/system-logs/port.js' */

/**
 * @typedef {Object} BackfillResult
 * @property {number} missing - reports lacking a number when the run started
 * @property {number} mapped - given at least one number (would be, on a dry run)
 * @property {number} unmapped - left lacking a number, each logged with the reason
 * @property {number} failed - not written; retried on the next run
 * @property {number} auditFailed - written but not audited
 */

/**
 * @typedef {Object} Repositories
 * @property {ReportsRepository} reportsRepository
 * @property {SystemLogsRepository} systemLogsRepository
 * @property {OrganisationsRepository} organisationsRepository
 */

/**
 * @param {OrganisationsRepository} organisationsRepository
 * @param {Report} report
 * @returns {Promise<{ numbers: ReportNumbers, unmapped: string[] }>}
 */
const lookUpNumbers = async (
  organisationsRepository,
  { organisationId, registrationId }
) => {
  try {
    const organisation = await organisationsRepository.findById(organisationId)
    return numbersFor(organisation, { registrationId })
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
 * @param {ReportsRepository} reportsRepository
 * @param {string} id
 * @returns {Promise<Report | null>} null if gone
 */
const findReport = async (reportsRepository, id) => {
  try {
    return await reportsRepository.findReportById(id)
  } catch (error) {
    if (Boom.isBoom(error, StatusCodes.NOT_FOUND)) {
      return null
    }
    throw error
  }
}

/**
 * @param {ReportNumbers} numbers
 * @param {Report} report
 * @returns {ReportNumbers}
 */
const numbersLacking = (numbers, report) =>
  Object.fromEntries(
    Object.entries(numbers).filter(([key]) => report[key] === undefined)
  )

/**
 * Each report is given the numbers it lacks, then audited. Once written, an
 * audit failure is logged with the numbers for reconciliation and counted
 * apart from write failures.
 *
 * @param {Repositories} repositories
 * @param {string} id
 * @param {boolean} isDryRun
 * @param {TypedLogger} logger
 * @returns {Promise<{ mapped: boolean, unmapped: boolean, auditFailed: boolean } | null>} null if gone
 */
const backfillOne = async (
  { reportsRepository, systemLogsRepository, organisationsRepository },
  id,
  isDryRun,
  logger
) => {
  const report = await findReport(reportsRepository, id)
  if (!report) {
    return null
  }

  const { organisationId, registrationId } = report
  const { numbers, unmapped } = await lookUpNumbers(
    organisationsRepository,
    report
  )
  if (unmapped.length > 0) {
    logger.info({
      message: `Report numbers unmapped: reportId=${id} organisationId=${organisationId} registrationId=${registrationId} reasons="${unmapped.join('; ')}"`
    })
  }

  const lacking = numbersLacking(numbers, report)
  const outcome = {
    mapped: Object.keys(lacking).length > 0,
    unmapped: unmapped.length > 0,
    auditFailed: false
  }
  if (!outcome.mapped || isDryRun) {
    return outcome
  }

  await reportsRepository.assignNumbers(id, lacking)

  try {
    await auditReportNumbersBackfill(systemLogsRepository, {
      reportId: id,
      organisationId,
      registrationId,
      next: lacking
    })
  } catch (error) {
    logger.error({
      err: error,
      message: `Numbers written but audit failed for report ${id}: ${JSON.stringify(lacking)}`
    })
    return { ...outcome, auditFailed: true }
  }

  return outcome
}

/**
 * Adds to each report the organisation and registration numbers it lacks,
 * read from its organisation record. Logs one line for each report it cannot
 * fully map, saying why. A failure is logged and swallowed so one bad report
 * never stops the sweep.
 *
 * @param {Repositories & { logger: TypedLogger }} deps
 * @param {{ isDryRun: boolean }} options
 * @returns {Promise<BackfillResult>}
 */
export const backfillReportNumbers = async (
  { logger, ...repositories },
  { isDryRun }
) => {
  const ids = await repositories.reportsRepository.findIdsWithoutNumbers()
  const result = {
    missing: ids.length,
    mapped: 0,
    unmapped: 0,
    failed: 0,
    auditFailed: 0
  }

  for (const id of ids) {
    try {
      const outcome = await backfillOne(repositories, id, isDryRun, logger)
      if (outcome) {
        result.mapped += Number(outcome.mapped)
        result.unmapped += Number(outcome.unmapped)
        result.auditFailed += Number(outcome.auditFailed)
      }
    } catch (error) {
      logger.error({
        err: error,
        message: `Failed to backfill numbers for report ${id}`
      })
      result.failed++
    }
  }

  return result
}
