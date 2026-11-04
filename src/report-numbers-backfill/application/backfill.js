import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'

import { sweepNumbersBackfillByReason } from '#common/helpers/numbers-backfill.js'
import {
  toAccreditationNumber,
  toOrganisationNumber
} from '#domain/organisations/numbers.js'
import { toReadModelRegistration } from '#organisation-read-model/repository/adapter.js'
import { CADENCE } from '#reports/domain/cadence.js'
import { auditReportNumbersBackfill } from './audit.js'

/** @import { TypedLogger } from '#common/hapi-types.js' */
/** @import { ReasonedBackfillResult } from '#common/helpers/numbers-backfill.js' */
/** @import { Organisation } from '#domain/organisations/model.js' */
/** @import { AccreditationNumber } from '#domain/organisations/numbers.js' */
/** @import { OrganisationsRepository } from '#repositories/organisations/port.js' */
/** @import { Report, ReportNumbers, ReportsRepository } from '#reports/repository/port.js' */
/** @import { SystemLogsRepository } from '#repositories/system-logs/port.js' */

/**
 * @typedef {Object} Repositories
 * @property {ReportsRepository} reportsRepository
 * @property {SystemLogsRepository} systemLogsRepository
 * @property {OrganisationsRepository} organisationsRepository
 */

/** @type {(keyof ReportNumbers)[]} */
const NUMBER_KEYS = [
  'organisationNumber',
  'registrationNumber',
  'accreditationNumber'
]

/**
 * Accreditations of registrations held at `created` to work round a bug, so
 * left out of the read model. By registration number, then year.
 *
 * @type {Record<string, Record<string, AccreditationNumber>>}
 */
const HELD_REGISTRATION_ACCREDITATIONS = {
  R26ER5003510176PL: { 2026: toAccreditationNumber('A26ER5003510171PL') },
  R26EX5002660006AL: { 2026: toAccreditationNumber('A26EX5002660016AL') },
  R26EX5002660007PL: { 2026: toAccreditationNumber('A26EX5002660017PL') }
}

/**
 * A failed lookup: `reason` groups reports, `detail` says what this
 * registration's records hold.
 *
 * @typedef {{ reason: string, detail?: string }} Failure
 */

/**
 * @param {string} detail
 * @param {string[]} drops why the read model left records out
 */
const withDrops = (detail, drops) =>
  drops.length ? `${detail} (${drops.join(', ')})` : detail

/**
 * @param {OrganisationsRepository} organisationsRepository
 * @param {string} id
 * @returns {Promise<Organisation | null>} null if not found
 */
const findOrganisation = async (organisationsRepository, id) => {
  try {
    return await organisationsRepository.findById(id)
  } catch (error) {
    if (Boom.isBoom(error, StatusCodes.NOT_FOUND)) {
      return null
    }
    throw error
  }
}

/**
 * A monthly report's accreditation is the one its registration holds in the
 * read model for the report's year; a quarterly report has none. The failure
 * names the first lookup that found nothing, and why the read model left
 * records out.
 *
 * @param {OrganisationsRepository} organisationsRepository
 * @param {Report} report
 * @returns {Promise<{ numbers: ReportNumbers, failure?: Failure }>}
 */
const lookUpNumbers = async (
  organisationsRepository,
  { organisationId, registrationId, cadence, year }
) => {
  const organisation = await findOrganisation(
    organisationsRepository,
    organisationId
  )
  if (!organisation) {
    return { numbers: {}, failure: { reason: 'organisation not found' } }
  }
  const organisationNumber = toOrganisationNumber(String(organisation.orgId))
  /** @type {ReportNumbers} */
  const numbers =
    cadence === CADENCE.quarterly
      ? { organisationNumber, accreditationNumber: null }
      : { organisationNumber }

  const registration = organisation.registrations.find(
    ({ id }) => id === registrationId
  )
  if (!registration) {
    return { numbers, failure: { reason: 'registration not found' } }
  }
  const { registrationNumber } = registration
  if (!registrationNumber) {
    return { numbers, failure: { reason: 'no registration number' } }
  }
  numbers.registrationNumber = registrationNumber

  if (cadence === CADENCE.quarterly) {
    return { numbers }
  }

  /** @type {string[]} */
  const drops = []
  const readRegistration = toReadModelRegistration(
    organisation,
    registration,
    (message) => drops.push(message)
  )
  if (!readRegistration) {
    const held =
      HELD_REGISTRATION_ACCREDITATIONS[registrationNumber]?.[String(year)]
    if (held) {
      numbers.accreditationNumber = held
      return { numbers }
    }
    return {
      numbers,
      failure: {
        reason: 'registration not in read model',
        detail: withDrops(registrationNumber, drops)
      }
    }
  }
  const { accreditations } = readRegistration
  const accreditation = accreditations[String(year)]
  if (!accreditation) {
    const held = Object.keys(accreditations).join(', ') || 'none'
    return {
      numbers,
      failure: {
        reason: 'no accreditation for the report year',
        detail: withDrops(
          `${registrationNumber} has no ${year} accreditation, holds ${held}`,
          drops
        )
      }
    }
  }
  numbers.accreditationNumber = accreditation.accreditationNumber
  return { numbers }
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
 * @param {(failure: Failure) => void} explain
 * @returns {Promise<{ mapped: boolean, unmapped: string[], auditFailed: boolean } | null>} null if gone
 */
const backfillOne = async (repositories, id, isDryRun, logger, explain) => {
  const { reportsRepository, systemLogsRepository, organisationsRepository } =
    repositories
  const report = await findReport(reportsRepository, id)
  if (!report) {
    return null
  }

  const { numbers, failure } = await lookUpNumbers(
    organisationsRepository,
    report
  )
  const leftLacking = NUMBER_KEYS.some(
    (key) => numbers[key] === undefined && report[key] === undefined
  )

  const unmapped = failure && leftLacking ? failure : undefined
  if (unmapped) {
    explain(unmapped)
  }

  const lacking = numbersLacking(numbers, report)
  const outcome = {
    mapped: Object.keys(lacking).length > 0,
    unmapped: unmapped ? [unmapped.reason] : [],
    auditFailed: false
  }
  if (!outcome.mapped || isDryRun) {
    return outcome
  }

  const { organisationId, registrationId } = report
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
 * Logs each distinct detail once, however many reports share it.
 *
 * @param {TypedLogger} logger
 * @returns {(failure: Failure) => void}
 */
const explainer = (logger) => {
  const logged = new Set()
  return ({ reason, detail }) => {
    const message = `Report numbers backfill: ${reason}: ${detail}`
    if (detail && !logged.has(message)) {
      logged.add(message)
      logger.info({ message })
    }
  }
}

/**
 * Adds to each report the organisation, registration and accreditation numbers
 * it lacks.
 *
 * @param {Repositories & { logger: TypedLogger }} deps
 * @param {{ isDryRun: boolean }} options
 * @returns {Promise<ReasonedBackfillResult>}
 */
export const backfillReportNumbers = async (
  { logger, ...repositories },
  { isDryRun }
) => {
  const explain = explainer(logger)
  return sweepNumbersBackfillByReason({
    ids: await repositories.reportsRepository.findIdsWithoutNumbers(),
    backfillOne: (id) =>
      backfillOne(repositories, id, isDryRun, logger, explain),
    documentName: 'report',
    logger
  })
}
