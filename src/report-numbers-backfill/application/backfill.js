import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'

import { deriveAccreditationYear } from '#common/helpers/dates/accreditation.js'
import { sweepNumbersBackfillByReason } from '#common/helpers/numbers-backfill.js'
import { ACCREDITATION_STATUS } from '#domain/organisations/model.js'
import { numbersFor } from '#domain/organisations/numbers.js'
import { isAccreditationForRegistration } from '#formsubmission/submission-keys.js'
import { CADENCE } from '#reports/domain/cadence.js'
import { auditReportNumbersBackfill } from './audit.js'

/** @import { TypedLogger } from '#common/hapi-types.js' */
/** @import { ReasonedBackfillResult } from '#common/helpers/numbers-backfill.js' */
/** @import { Organisation } from '#domain/organisations/model.js' */
/** @import { Registration } from '#domain/organisations/registration.js' */
/** @import { OrganisationsRepository } from '#repositories/organisations/port.js' */
/** @import { Report, ReportNumbers, ReportsRepository } from '#reports/repository/port.js' */
/** @import { SummaryLogsRepository } from '#repositories/summary-logs/port.js' */
/** @import { SystemLogsRepository } from '#repositories/system-logs/port.js' */
/** @import { SummaryLogFileId } from '#domain/summary-logs/ids.js' */
/** @import { WasteBalanceLedgerRepository } from '#waste-balances/repository/ledger-port.js' */

/**
 * @typedef {Object} Repositories
 * @property {ReportsRepository} reportsRepository
 * @property {SystemLogsRepository} systemLogsRepository
 * @property {OrganisationsRepository} organisationsRepository
 * @property {SummaryLogsRepository} summaryLogsRepository
 * @property {WasteBalanceLedgerRepository} ledgerRepository
 */

/** @type {(keyof ReportNumbers)[]} */
const NUMBER_KEYS = [
  'organisationNumber',
  'registrationNumber',
  'accreditationNumber'
]

const NO_SUMMARY_LOG = 'report names no summary log'

/**
 * The accreditation a report was made under and what records it, or why the
 * report records none.
 *
 * @typedef {{ accreditationId: string | null, recordedBy: 'cadence' | 'summary log' | 'ledger' } | { unrecorded: string }} ReportAccreditation
 */

/**
 * The organisation's accreditations that match the registration under the rule
 * that links a registration to its accreditation. The organisation record keeps
 * no history of a registration's accreditation links, but an accreditation
 * stays on the organisation after a registration is re-linked away from it. So
 * one matching accreditation is the nearest the record comes to saying the
 * registration has only ever had one.
 *
 * @param {Organisation} organisation
 * @param {Registration} registration
 */
const accreditationsMatching = (organisation, registration) =>
  organisation.accreditations.filter((accreditation) =>
    isAccreditationForRegistration(accreditation, registration)
  )

/**
 * Whether the registration could have been linked to a different accreditation
 * in the report's year. A match with no validFrom counts, as its year cannot be
 * told.
 *
 * @param {Organisation} organisation
 * @param {Report} report
 * @param {string} accreditationId
 */
const anotherAccreditationFitsYear = (
  organisation,
  { registrationId, year },
  accreditationId
) => {
  const registration = organisation.registrations.find(
    ({ id }) => id === registrationId
  )
  return (
    registration !== undefined &&
    accreditationsMatching(organisation, registration).some(
      (candidate) =>
        candidate.id !== accreditationId &&
        (!candidate.validFrom || deriveAccreditationYear(candidate) === year)
    )
  )
}

/**
 * A summary log from before summary logs stored their accreditation was
 * appended to one accreditation's ledger, which a report built from it read.
 * The rebuild that first filled the ledgers filed each older summary log under
 * the accreditation linked at that time, which can be later than the one the
 * report was made under. So the ledger's accreditation is accepted only if it
 * is for the report's year and no other accreditation could be.
 *
 * @param {WasteBalanceLedgerRepository} ledgerRepository
 * @param {Organisation} organisation
 * @param {Report} report
 * @param {SummaryLogFileId} fileId
 * @returns {Promise<ReportAccreditation>}
 */
const accreditationInLedger = async (
  ledgerRepository,
  organisation,
  report,
  fileId
) => {
  const { organisationId, registrationId, year } = report
  const accreditationIds = (
    await ledgerRepository.findAccreditationIdsOfSummaryLog(
      { organisationId, registrationId },
      fileId
    )
  ).filter((id) => id !== null)
  if (accreditationIds.length === 0) {
    return { unrecorded: 'ledger records no accreditation for summary log' }
  }
  if (accreditationIds.length > 1) {
    return {
      unrecorded: 'ledger records several accreditations for summary log'
    }
  }
  const [accreditationId] = accreditationIds
  const accreditation = organisation.accreditations.find(
    ({ id }) => id === accreditationId
  )
  if (!accreditation) {
    return { accreditationId, recordedBy: 'ledger' }
  }
  if (!accreditation.validFrom) {
    return { unrecorded: 'ledger names an accreditation with no year' }
  }
  if (deriveAccreditationYear(accreditation) !== year) {
    return { unrecorded: "ledger names another year's accreditation" }
  }
  return anotherAccreditationFitsYear(organisation, report, accreditationId)
    ? { unrecorded: "several accreditations match in the report's year" }
    : { accreditationId, recordedBy: 'ledger' }
}

/**
 * A monthly report is built from the ledger of its source summary log, so its
 * accreditation comes from that summary log or, for an older log, that ledger,
 * whatever the registration links to now. A quarterly report has none.
 *
 * @param {Pick<Repositories, 'summaryLogsRepository' | 'ledgerRepository'>} repositories
 * @param {Organisation} organisation
 * @param {Report} report
 * @returns {Promise<ReportAccreditation>}
 */
const accreditationOf = async (
  { summaryLogsRepository, ledgerRepository },
  organisation,
  report
) => {
  const { cadence, source } = report
  if (cadence === CADENCE.quarterly) {
    return { accreditationId: null, recordedBy: 'cadence' }
  }
  if (!source?.summaryLogId) {
    return { unrecorded: NO_SUMMARY_LOG }
  }
  const fileIdTheLedgerRecords = source.summaryLogId
  const found = await summaryLogsRepository.findByFileId(fileIdTheLedgerRecords)
  if (!found) {
    return { unrecorded: 'summary log not found' }
  }
  const { accreditationId } = found.summaryLog
  if (accreditationId === undefined) {
    return accreditationInLedger(
      ledgerRepository,
      organisation,
      report,
      fileIdTheLedgerRecords
    )
  }
  return accreditationId
    ? { accreditationId, recordedBy: 'summary log' }
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
    : 'accreditation not found'
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
    : 'registration not found',
  accreditationNumber: accreditationCause(organisation, accreditation)
})

/**
 * @param {Organisation} organisation
 * @param {Registration} registration
 * @returns {MappingCase}
 */
const noSummaryLogCase = (organisation, registration) => {
  const candidates = accreditationsMatching(organisation, registration)
  const held =
    ['no accreditation', 'one accreditation'][candidates.length] ??
    'several accreditations'
  return {
    name: `${NO_SUMMARY_LOG}, ${held} matching its registration`,
    cancelled: candidates.some(
      ({ status }) => status === ACCREDITATION_STATUS.CANCELLED
    )
  }
}

/**
 * Which mapping rule decides a report, so that the summary line counts the
 * reports each rule decides, and whether an accreditation the case rests on is
 * cancelled.
 *
 * @typedef {{ name: string, cancelled: boolean }} MappingCase
 */

/**
 * @param {Organisation} organisation
 * @param {Report} report
 * @param {ReportAccreditation} accreditation
 * @returns {MappingCase}
 */
const mappingCaseOf = (
  organisation,
  { cadence, registrationId },
  accreditation
) => {
  const recorded =
    'unrecorded' in accreditation
      ? undefined
      : organisation.accreditations.find(
          ({ id }) => id === accreditation.accreditationId
        )
  const cancelled = recorded?.status === ACCREDITATION_STATUS.CANCELLED
  const registration = organisation.registrations.find(
    ({ id }) => id === registrationId
  )
  if (!registration) {
    return { name: 'registration not found', cancelled }
  }
  if (cadence === CADENCE.quarterly) {
    return { name: 'quarterly', cancelled: false }
  }
  if ('unrecorded' in accreditation) {
    return accreditation.unrecorded === NO_SUMMARY_LOG
      ? noSummaryLogCase(organisation, registration)
      : { name: accreditation.unrecorded, cancelled: false }
  }
  if (!recorded) {
    return { name: 'accreditation not found', cancelled: false }
  }
  return {
    name:
      recorded.id === registration.accreditationId
        ? `${accreditation.recordedBy} accreditation is the current link`
        : `${accreditation.recordedBy} accreditation differs from the current link`,
    cancelled
  }
}

/**
 * @param {Repositories} repositories
 * @param {Report} report
 * @returns {Promise<{ numbers: ReportNumbers, unmapped: string[], mappingCase: MappingCase }>}
 */
const lookUpNumbers = async (repositories, report) => {
  try {
    const organisation = await repositories.organisationsRepository.findById(
      report.organisationId
    )
    const accreditation = await accreditationOf(
      repositories,
      organisation,
      report
    )
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
    return {
      numbers,
      unmapped,
      mappingCase: mappingCaseOf(organisation, report, accreditation)
    }
  } catch (error) {
    if (Boom.isBoom(error, StatusCodes.NOT_FOUND)) {
      return {
        numbers: {},
        unmapped: ['organisation not found'],
        mappingCase: { name: 'organisation not found', cancelled: false }
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
 * @returns {Promise<{ mapped: boolean, unmapped: string[], auditFailed: boolean, mappingCase: MappingCase } | null>} null if gone
 */
const backfillOne = async (repositories, id, isDryRun, logger) => {
  const { reportsRepository, systemLogsRepository } = repositories
  const report = await findReport(reportsRepository, id)
  if (!report) {
    return null
  }

  const { organisationId, registrationId } = report
  const { numbers, unmapped, mappingCase } = await lookUpNumbers(
    repositories,
    report
  )

  const lacking = numbersLacking(numbers, report)
  const outcome = {
    mapped: Object.keys(lacking).length > 0,
    unmapped,
    auditFailed: false,
    mappingCase
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
 * Counts the reports it meets under their mapping case, and counts those whose
 * case rests on a cancelled accreditation.
 *
 * @param {Repositories & { logger: TypedLogger }} deps
 * @param {{ isDryRun: boolean }} options
 * @returns {Promise<ReasonedBackfillResult & { cases: Record<string, number>, cancelledAccreditations: number }>}
 */
export const backfillReportNumbers = async (
  { logger, ...repositories },
  { isDryRun }
) => {
  /** @type {Record<string, number>} */
  const cases = {}
  let cancelledAccreditations = 0

  const result = await sweepNumbersBackfillByReason({
    ids: await repositories.reportsRepository.findIdsWithoutNumbers(),
    backfillOne: async (id) => {
      const outcome = await backfillOne(repositories, id, isDryRun, logger)
      if (outcome) {
        const { name, cancelled } = outcome.mappingCase
        cases[name] = (cases[name] ?? 0) + 1
        cancelledAccreditations += Number(cancelled)
      }
      return outcome
    },
    documentName: 'report',
    logger
  })

  return { ...result, cases, cancelledAccreditations }
}
