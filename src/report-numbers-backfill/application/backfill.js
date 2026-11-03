import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'

import { sweepNumbersBackfillByReason } from '#common/helpers/numbers-backfill.js'
import { numbersFor } from '#domain/organisations/numbers.js'
import { CADENCE } from '#reports/domain/cadence.js'
import { auditReportNumbersBackfill } from './audit.js'

/** @import { TypedLogger } from '#common/hapi-types.js' */
/** @import { ReasonedBackfillResult } from '#common/helpers/numbers-backfill.js' */
/** @import { Organisation } from '#domain/organisations/model.js' */
/** @import { OrganisationsRepository } from '#repositories/organisations/port.js' */
/** @import { Report, ReportNumbers, ReportsRepository } from '#reports/repository/port.js' */
/** @import { SummaryLogsRepository } from '#repositories/summary-logs/port.js' */
/** @import { SystemLogsRepository } from '#repositories/system-logs/port.js' */

/**
 * @typedef {Object} Repositories
 * @property {ReportsRepository} reportsRepository
 * @property {SystemLogsRepository} systemLogsRepository
 * @property {OrganisationsRepository} organisationsRepository
 * @property {SummaryLogsRepository} summaryLogsRepository
 */

/** @type {(keyof ReportNumbers)[]} */
const NUMBER_KEYS = [
  'organisationNumber',
  'registrationNumber',
  'accreditationNumber'
]

/**
 * The accreditation a report was made under, or why the report records none.
 *
 * @typedef {{ accreditationId: string | null } | { unrecorded: string }} ReportAccreditation
 */

/**
 * A monthly report is built from the ledger of its source summary log, so its
 * accreditation is the one that summary log was submitted for, whatever the
 * registration links to now. A quarterly report has none.
 *
 * @param {SummaryLogsRepository} summaryLogsRepository
 * @param {Report} report
 * @returns {Promise<ReportAccreditation>}
 */
const accreditationOf = async (summaryLogsRepository, { cadence, source }) => {
  if (cadence === CADENCE.quarterly) {
    return { accreditationId: null }
  }
  if (!source?.summaryLogId) {
    return { unrecorded: 'report names no summary log' }
  }
  const found = await summaryLogsRepository.findById(source.summaryLogId)
  if (!found) {
    return { unrecorded: 'summary log not found' }
  }
  const { accreditationId } = found.summaryLog
  return accreditationId
    ? { accreditationId }
    : { unrecorded: 'summary log names no accreditation' }
}

/**
 * @param {Organisation} organisation
 * @param {ReportAccreditation} accreditation
 */
const accreditationCause = (organisation, accreditation) => {
  if ('unrecorded' in accreditation) {
    return accreditation.unrecorded
  }
  return organisation.accreditations.some(
    ({ id }) => id === accreditation.accreditationId
  )
    ? 'no accreditation number'
    : 'accreditation not held by the organisation'
}

/**
 * Why each number cannot be read, worded the same for every report so that
 * reports group by cause.
 *
 * @param {Organisation} organisation
 * @param {Report} report
 * @param {ReportAccreditation} accreditation
 * @returns {Record<keyof ReportNumbers, string>}
 */
const causes = (organisation, { registrationId }, accreditation) => ({
  organisationNumber: 'no organisation number',
  registrationNumber: organisation.registrations.some(
    ({ id }) => id === registrationId
  )
    ? 'no registration number'
    : 'registration not held by the organisation',
  accreditationNumber: accreditationCause(organisation, accreditation)
})

/**
 * @param {Repositories} repositories
 * @param {Report} report
 * @returns {Promise<{ numbers: ReportNumbers, unmapped: string[] }>}
 */
const lookUpNumbers = async (
  { organisationsRepository, summaryLogsRepository },
  report
) => {
  try {
    const organisation = await organisationsRepository.findById(
      report.organisationId
    )
    const accreditation = await accreditationOf(summaryLogsRepository, report)
    const { numbers } = numbersFor(organisation, {
      registrationId: report.registrationId,
      accreditationId:
        'unrecorded' in accreditation
          ? undefined
          : accreditation.accreditationId
    })
    const cause = causes(organisation, report, accreditation)
    const unmapped = NUMBER_KEYS.filter(
      (key) => numbers[key] === undefined && report[key] === undefined
    ).map((key) => cause[key])
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
const backfillOne = async (repositories, id, isDryRun, logger) => {
  const { reportsRepository, systemLogsRepository } = repositories
  const report = await findReport(reportsRepository, id)
  if (!report) {
    return null
  }

  const { organisationId, registrationId } = report
  const { numbers, unmapped } = await lookUpNumbers(repositories, report)

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
 * it lacks, read from its organisation record for the accreditation the report
 * was made under.
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
