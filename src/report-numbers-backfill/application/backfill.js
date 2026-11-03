import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'

import {
  sweepNumbersBackfill,
  sweepNumbersBackfillByReason
} from '#common/helpers/numbers-backfill.js'
import { numbersFor } from '#domain/organisations/numbers.js'
import { auditReportNumbersBackfill } from './audit.js'

/** @import { TypedLogger } from '#common/hapi-types.js' */
/** @import { ReasonedBackfillResult } from '#common/helpers/numbers-backfill.js' */
/** @import { OrganisationsRepository } from '#repositories/organisations/port.js' */
/** @import { Report, ReportNumbers, ReportsRepository } from '#reports/repository/port.js' */
/** @import { SystemLogsRepository } from '#repositories/system-logs/port.js' */

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
const lookUpNumbers = async (organisationsRepository, report) => {
  try {
    const organisation = await organisationsRepository.findById(
      report.organisationId
    )
    const { registrationId } = report
    const { numbers } = numbersFor(organisation, { registrationId })
    /** @type {Record<keyof ReportNumbers, string>} */
    const cause = {
      organisationNumber: 'no organisation number',
      registrationNumber: organisation.registrations.some(
        ({ id }) => id === registrationId
      )
        ? 'no registration number'
        : 'registration not found'
    }
    const unmapped = Object.entries(cause)
      .filter(
        ([key]) => numbers[key] === undefined && report[key] === undefined
      )
      .map(([, reason]) => reason)
    return { numbers, unmapped }
  } catch (error) {
    if (Boom.isBoom(error, StatusCodes.NOT_FOUND)) {
      return { numbers: {}, unmapped: ['organisation not found'] }
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
 * @returns {Promise<{ mapped: boolean, unmapped: string[], auditFailed: boolean } | null>} null if gone
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

  const lacking = numbersLacking(numbers, report)
  const outcome = {
    mapped: Object.keys(lacking).length > 0,
    unmapped,
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
 * Adds to each report the organisation and registration numbers it lacks, read
 * from its organisation record.
 *
 * @param {Repositories & { logger: TypedLogger }} deps
 * @param {{ isDryRun: boolean }} options
 * @returns {Promise<ReasonedBackfillResult>}
 */
export const backfillReportNumbers = async (
  { logger, ...repositories },
  { isDryRun }
) =>
  sweepNumbersBackfillByReason({
    ids: await repositories.reportsRepository.findIdsWithoutNumbers(),
    backfillOne: (id) => backfillOne(repositories, id, isDryRun, logger),
    documentName: 'report',
    logger
  })

/**
 * @typedef {Object} AccreditationNumberRemovalResult
 * @property {number} held - reports holding an accreditation number when the run started
 * @property {number} removed - had it removed (would have, on a dry run)
 * @property {number} failed - not written; retried on the next run
 * @property {number} auditFailed - written but not audited
 */

/**
 * @param {Repositories} repositories
 * @param {string} id
 * @param {boolean} isDryRun
 * @param {TypedLogger} logger
 * @returns {Promise<{ auditFailed: boolean } | null>} null if gone
 */
const removeOne = async (
  { reportsRepository, systemLogsRepository },
  id,
  isDryRun,
  logger
) => {
  const report = await findReport(reportsRepository, id)
  if (!report) {
    return null
  }
  if (isDryRun) {
    return { auditFailed: false }
  }

  const removed = await reportsRepository.removeAccreditationNumber(id)
  if (!removed) {
    return null
  }

  try {
    await auditReportNumbersBackfill(systemLogsRepository, {
      reportId: id,
      organisationId: report.organisationId,
      registrationId: report.registrationId,
      previous: removed
    })
  } catch (error) {
    logger.error({
      err: error,
      message: `Accreditation number removed but audit failed for report ${id}: ${JSON.stringify(removed)}`
    })
    return { auditFailed: true }
  }
  return { auditFailed: false }
}

/**
 * Removes the accreditation number from each report stored with one, since a
 * report carries organisation and registration numbers only.
 *
 * @param {Repositories & { logger: TypedLogger }} deps
 * @param {{ isDryRun: boolean }} options
 * @returns {Promise<AccreditationNumberRemovalResult>}
 */
export const removeReportAccreditationNumbers = async (
  { logger, ...repositories },
  { isDryRun }
) => {
  const ids =
    await repositories.reportsRepository.findIdsWithAccreditationNumber()
  const result = { held: ids.length, removed: 0, failed: 0, auditFailed: 0 }
  result.failed = await sweepNumbersBackfill({
    ids,
    backfillOne: (id) => removeOne(repositories, id, isDryRun, logger),
    tally: (_, { auditFailed }) => {
      result.removed++
      result.auditFailed += Number(auditFailed)
    },
    documentName: 'report',
    logger
  })
  return result
}
