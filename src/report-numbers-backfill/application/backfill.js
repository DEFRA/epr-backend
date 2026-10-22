import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'

import { numbersFor } from '#domain/organisations/numbers.js'
import { CADENCE } from '#reports/domain/cadence.js'
import { accreditationsForYear } from '#routes/organisations/natural-keys.js'
import { auditReportNumbersBackfill } from './audit.js'

/** @import { TypedLogger } from '#common/hapi-types.js' */
/** @import { Organisation } from '#domain/organisations/model.js' */
/** @import { OrganisationsRepository } from '#repositories/organisations/port.js' */
/** @import { Report, ReportNumbers, ReportsRepository } from '#reports/repository/port.js' */
/** @import { SystemLogsRepository } from '#repositories/system-logs/port.js' */

/**
 * @typedef {Object} BackfillResult
 * @property {number} missing - reports lacking a number when the run started
 * @property {number} mapped - given at least one number (would be, on a dry run)
 * @property {number} unmapped - left lacking a number
 * @property {Record<string, string[]>} unmappedReasons - the ids of the reports left lacking a number, by reason
 * @property {number} failed - not written; retried on the next run
 * @property {number} auditFailed - written but not audited
 */

/**
 * @typedef {Object} Repositories
 * @property {ReportsRepository} reportsRepository
 * @property {SystemLogsRepository} systemLogsRepository
 * @property {OrganisationsRepository} organisationsRepository
 */

/** @type {[keyof ReportNumbers, string][]} */
const NO_NUMBER = [
  ['organisationNumber', 'no organisation number'],
  ['registrationNumber', 'no registration number'],
  ['accreditationNumber', 'no accreditation number']
]

/**
 * The accreditation a report was made under, found as the accredited report
 * routes find it: a monthly report's is its registration's accreditation for
 * the report's year, and a quarterly report has none. Undefined where no
 * single accreditation can be found.
 *
 * @param {Organisation} organisation
 * @param {Report} report
 * @returns {string | null | undefined}
 */
const accreditationIdOf = (organisation, { registrationId, cadence, year }) => {
  if (cadence === CADENCE.quarterly) {
    return null
  }
  const registration = organisation.registrations.find(
    ({ id }) => id === registrationId
  )
  if (!registration) {
    return undefined
  }
  const [accreditation, ...others] = accreditationsForYear(
    organisation,
    registration,
    year
  )
  if (accreditation === undefined || others.length > 0) {
    return undefined
  }
  return accreditation.id
}

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
    const { numbers } = numbersFor(organisation, {
      registrationId: report.registrationId,
      accreditationId: accreditationIdOf(organisation, report)
    })
    const unmapped = NO_NUMBER.filter(
      ([key]) => numbers[key] === undefined
    ).map(([, reason]) => reason)
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
 * Adds to each report the organisation, registration and accreditation numbers
 * it lacks, read from its organisation record. Each report it cannot fully map
 * is returned under every reason that applies. A failure is logged and
 * swallowed so one bad report never stops the sweep.
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
    /** @type {Record<string, string[]>} */
    unmappedReasons: {},
    failed: 0,
    auditFailed: 0
  }

  for (const id of ids) {
    try {
      const outcome = await backfillOne(repositories, id, isDryRun, logger)
      if (outcome) {
        result.mapped += Number(outcome.mapped)
        result.unmapped += Number(outcome.unmapped.length > 0)
        for (const reason of outcome.unmapped) {
          result.unmappedReasons[reason] = [
            ...(result.unmappedReasons[reason] ?? []),
            id
          ]
        }
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
