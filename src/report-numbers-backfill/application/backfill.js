import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'

import { sweepNumbersBackfillByReason } from '#common/helpers/numbers-backfill.js'
import { ACCREDITATION_STATUS } from '#domain/organisations/model.js'
import { toOrganisationNumber } from '#domain/organisations/numbers.js'
import { isAccreditationForRegistration } from '#formsubmission/submission-keys.js'
import { CADENCE } from '#reports/domain/cadence.js'
import { auditReportNumbersBackfill } from './audit.js'

/** @import { TypedLogger } from '#common/hapi-types.js' */
/** @import { ReasonedBackfillResult } from '#common/helpers/numbers-backfill.js' */
/** @import { OrganisationNumber } from '#domain/organisations/numbers.js' */
/** @import { Organisation } from '#domain/organisations/model.js' */
/** @import { Organisation as ReadModelOrganisation } from '#organisation-read-model/domain/model.js' */
/** @import { OrganisationReadRepository } from '#organisation-read-model/repository/port.js' */
/** @import { OrganisationsRepository } from '#repositories/organisations/port.js' */
/** @import { Report, ReportNumbers, ReportsRepository } from '#reports/repository/port.js' */
/** @import { SystemLogsRepository } from '#repositories/system-logs/port.js' */

/**
 * @typedef {Object} Repositories
 * @property {ReportsRepository} reportsRepository
 * @property {SystemLogsRepository} systemLogsRepository
 * @property {OrganisationsRepository} organisationsRepository
 * @property {OrganisationReadRepository} organisationReadRepository
 */

/**
 * @typedef {(organisationNumber: OrganisationNumber) => Promise<ReadModelOrganisation | null>} ReadModelLookup
 */

/**
 * A registration matched by more than one accreditation that was granted.
 *
 * @typedef {{
 *   organisationNumber: number,
 *   registrationId: string,
 *   accreditations: { id: string, accreditationNumber: string | null, status: string, validFrom?: string }[]
 * }} RegistrationWithSeveralAccreditations
 */

/** @type {(keyof ReportNumbers)[]} */
const NUMBER_KEYS = [
  'organisationNumber',
  'registrationNumber',
  'accreditationNumber'
]

/** @type {ReadonlySet<string>} */
const NEVER_GRANTED = new Set([
  ACCREDITATION_STATUS.CREATED,
  ACCREDITATION_STATUS.REJECTED
])

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
 * The organisation and registration numbers come from the stored organisation.
 * A monthly report's accreditation is the one its registration holds in the
 * read model for the report's year; a quarterly report has none. The failure
 * names the first lookup that found nothing.
 *
 * @param {OrganisationsRepository} organisationsRepository
 * @param {ReadModelLookup} readModelOrganisation
 * @param {Report} report
 * @returns {Promise<{ numbers: ReportNumbers, failure?: string }>}
 */
const lookUpNumbers = async (
  organisationsRepository,
  readModelOrganisation,
  { organisationId, registrationId, cadence, year }
) => {
  const organisation = await findOrganisation(
    organisationsRepository,
    organisationId
  )
  if (!organisation) {
    return { numbers: {}, failure: 'organisation not found' }
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
    return { numbers, failure: 'registration not found' }
  }
  const { registrationNumber } = registration
  if (!registrationNumber) {
    return { numbers, failure: 'no registration number' }
  }
  numbers.registrationNumber = registrationNumber

  if (cadence === CADENCE.quarterly) {
    return { numbers }
  }

  const readModel = await readModelOrganisation(organisationNumber)
  if (!readModel) {
    return { numbers, failure: 'organisation not in read model' }
  }
  const readRegistration = readModel.registrations[registrationNumber]
  if (!readRegistration) {
    return { numbers, failure: 'registration not in read model' }
  }
  const accreditation = readRegistration.accreditations[String(year)]
  if (!accreditation) {
    return { numbers, failure: 'no accreditation for the report year' }
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
 * @param {ReadModelLookup} readModelOrganisation
 * @param {string} id
 * @param {boolean} isDryRun
 * @param {TypedLogger} logger
 * @returns {Promise<{ mapped: boolean, unmapped: string[], auditFailed: boolean } | null>} null if gone
 */
const backfillOne = async (
  repositories,
  readModelOrganisation,
  id,
  isDryRun,
  logger
) => {
  const { reportsRepository, systemLogsRepository, organisationsRepository } =
    repositories
  const report = await findReport(reportsRepository, id)
  if (!report) {
    return null
  }

  const { numbers, failure } = await lookUpNumbers(
    organisationsRepository,
    readModelOrganisation,
    report
  )
  const leftLacking = NUMBER_KEYS.some(
    (key) => numbers[key] === undefined && report[key] === undefined
  )

  const lacking = numbersLacking(numbers, report)
  const outcome = {
    mapped: Object.keys(lacking).length > 0,
    unmapped: failure && leftLacking ? [failure] : [],
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
 * Each registration matched by more than one accreditation that was granted,
 * which would make the year of a report made under it ambiguous.
 *
 * @param {Organisation[]} organisations
 * @returns {RegistrationWithSeveralAccreditations[]}
 */
export const registrationsWithSeveralAccreditations = (organisations) =>
  organisations.flatMap((organisation) =>
    organisation.registrations.flatMap((registration) => {
      const granted = organisation.accreditations.filter(
        (accreditation) =>
          !NEVER_GRANTED.has(accreditation.status) &&
          isAccreditationForRegistration(accreditation, registration)
      )
      if (granted.length < 2) {
        return []
      }
      return [
        {
          organisationNumber: organisation.orgId,
          registrationId: registration.id,
          accreditations: granted.map(
            ({ id, accreditationNumber, status, validFrom }) => ({
              id,
              accreditationNumber,
              status,
              validFrom
            })
          )
        }
      ]
    })
  )

/**
 * Looks each organisation up in the read model once per run.
 *
 * @param {OrganisationReadRepository} organisationReadRepository
 * @returns {ReadModelLookup}
 */
const readModelLookup = (organisationReadRepository) => {
  /** @type {Map<OrganisationNumber, Promise<ReadModelOrganisation | null>>} */
  const found = new Map()
  return (organisationNumber) => {
    if (!found.has(organisationNumber)) {
      found.set(
        organisationNumber,
        organisationReadRepository.findByOrganisationNumber(organisationNumber)
      )
    }
    return /** @type {Promise<ReadModelOrganisation | null>} */ (
      found.get(organisationNumber)
    )
  }
}

/**
 * Adds to each report the organisation, registration and accreditation numbers
 * it lacks, and lists the registrations whose accreditation for a year could
 * be ambiguous.
 *
 * @param {Repositories & { logger: TypedLogger }} deps
 * @param {{ isDryRun: boolean }} options
 * @returns {Promise<ReasonedBackfillResult & { registrationsWithSeveralAccreditations: RegistrationWithSeveralAccreditations[] }>}
 */
export const backfillReportNumbers = async (
  { logger, ...repositories },
  { isDryRun }
) => {
  const readModelOrganisation = readModelLookup(
    repositories.organisationReadRepository
  )

  const result = await sweepNumbersBackfillByReason({
    ids: await repositories.reportsRepository.findIdsWithoutNumbers(),
    backfillOne: (id) =>
      backfillOne(repositories, readModelOrganisation, id, isDryRun, logger),
    documentName: 'report',
    logger
  })

  return {
    ...result,
    registrationsWithSeveralAccreditations:
      registrationsWithSeveralAccreditations(
        await repositories.organisationsRepository.findAll()
      )
  }
}
