import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'

import { utcYearOf } from '#common/helpers/dates/year.js'
import { REGISTERED_ONLY_PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import { metaText } from '#domain/summary-logs/stored-meta.js'
import { SUMMARY_LOG_STATUS } from '#domain/summary-logs/status.js'
import { auditSummaryLogScopeBackfill } from './audit.js'

/** @import { TypedLogger } from '#common/hapi-types.js' */
/** @import { SummaryLog } from '#domain/summary-logs/model.js' */
/** @import { SummaryLogId } from '#domain/summary-logs/ids.js' */
/** @import { SummaryLogStatus } from '#domain/summary-logs/status.js' */
/** @import { OrganisationsRepository } from '#repositories/organisations/port.js' */
/** @import { SummaryLogScope, SummaryLogsRepository } from '#repositories/summary-logs/port.js' */
/** @import { SystemLogsRepository } from '#repositories/system-logs/port.js' */

/**
 * @typedef {Object} BackfillResult
 * @property {number} missing - summary logs lacking an accreditation or a year when the run started
 * @property {number} inFlight - left for a later run while a worker may be writing them
 * @property {number} mapped - given their accreditation (would be, on a dry run)
 * @property {number} unmapped - left without an accreditation, each logged with the reason
 * @property {number} yearSet - given their year
 * @property {number} linkDiffers - given an accreditation other than the one their registration links to now, each logged
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
 * Until summary logs were scoped by year, 2026 was the only accreditation
 * year, so every summary log stored without a year is for 2026.
 */
const ONLY_ACCREDITATION_YEAR_BEFORE_SCOPING = utcYearOf('2026-01-01')

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

/** @typedef {Pick<OrganisationsRepository, 'findById'>} OrganisationLookup */

/**
 * Reads each organisation once for the run.
 *
 * @param {OrganisationLookup} organisationsRepository
 * @returns {OrganisationLookup}
 */
const readingEachOrganisationOnce = (organisationsRepository) => {
  /** @type {Map<string, ReturnType<OrganisationLookup['findById']>>} */
  const read = new Map()
  return {
    findById: (id) => {
      if (!read.has(id)) {
        read.set(id, organisationsRepository.findById(id))
      }
      return /** @type {ReturnType<OrganisationLookup['findById']>} */ (
        read.get(id)
      )
    }
  }
}

/**
 * The accreditation a summary log was uploaded for, read from the number its
 * spreadsheet names and checked against its organisation, with the
 * accreditation its registration links to now when that is another.
 *
 * @param {OrganisationLookup} organisationsRepository
 * @param {SummaryLog} summaryLog
 * @returns {Promise<{ scope: SummaryLogScope, linked?: string | null } | { unmapped: string }>}
 */
const lookUpAccreditation = async (
  organisationsRepository,
  { organisationId, registrationId, meta }
) => {
  const processingType = meta?.PROCESSING_TYPE
  if (!processingType) {
    return { unmapped: 'spreadsheet names no processing type' }
  }
  if (REGISTERED_ONLY_PROCESSING_TYPES.has(processingType)) {
    return { scope: { accreditationId: null, accreditationNumber: null } }
  }

  const accreditationNumber = metaText(meta?.ACCREDITATION_NUMBER)
  if (!accreditationNumber) {
    return { unmapped: 'spreadsheet names no accreditation number' }
  }
  if (!organisationId) {
    return { unmapped: 'summary log holds no organisation id' }
  }

  let organisation
  try {
    organisation = await organisationsRepository.findById(organisationId)
  } catch (error) {
    if (Boom.isBoom(error, StatusCodes.NOT_FOUND)) {
      return { unmapped: `organisation ${organisationId} not found` }
    }
    throw error
  }

  const accreditation = organisation.accreditations.find(
    (held) => held.accreditationNumber === accreditationNumber
  )
  if (!accreditation) {
    return {
      unmapped: `organisation ${organisationId} holds no accreditation ${accreditationNumber}`
    }
  }
  const scope = {
    accreditationId: accreditation.id,
    accreditationNumber: accreditation.accreditationNumber
  }
  const linked = organisation.registrations.find(
    (registration) => registration.id === registrationId
  )?.accreditationId
  return linked === accreditation.id ? { scope } : { scope, linked }
}

/**
 * The scope a summary log lacks, and why its accreditation cannot be given
 * when it cannot.
 *
 * @param {OrganisationLookup} organisationsRepository
 * @param {SummaryLog} summaryLog
 * @returns {Promise<{ lacking: SummaryLogScope, unmapped?: string, linked?: string | null }>}
 */
const scopeLacking = async (organisationsRepository, summaryLog) => {
  const year =
    summaryLog.year === undefined
      ? { year: ONLY_ACCREDITATION_YEAR_BEFORE_SCOPING }
      : {}
  if (summaryLog.accreditationNumber !== undefined) {
    return { lacking: year }
  }
  if (summaryLog.accreditationId !== undefined) {
    return {
      lacking: year,
      unmapped: `summary log holds accreditation id ${summaryLog.accreditationId} but no number`
    }
  }

  const accreditation = await lookUpAccreditation(
    organisationsRepository,
    summaryLog
  )
  if ('unmapped' in accreditation) {
    return { lacking: year, unmapped: accreditation.unmapped }
  }
  return {
    lacking: { ...accreditation.scope, ...year },
    ...('linked' in accreditation && { linked: accreditation.linked })
  }
}

/**
 * @param {SummaryLogId} id
 * @param {SummaryLog} summaryLog
 * @param {string} reason
 * @param {TypedLogger} logger
 */
const reportUnmapped = (
  id,
  { status, organisationId, registrationId, meta },
  reason,
  logger
) => {
  logger.info({
    message: `Summary log accreditation unmapped: summaryLogId=${id} status=${status} organisationId=${organisationId} registrationId=${registrationId} processingType=${meta?.PROCESSING_TYPE} accreditationNumber=${meta?.ACCREDITATION_NUMBER} reason="${reason}"`
  })
}

/**
 * @param {SummaryLogId} id
 * @param {SummaryLog} summaryLog
 * @param {SummaryLogScope} lacking
 * @param {string | null | undefined} linked
 * @param {TypedLogger} logger
 */
const reportLinkDiffers = (
  id,
  { organisationId, registrationId },
  lacking,
  linked,
  logger
) => {
  logger.info({
    message: `Summary log accreditation differs from its registration's: summaryLogId=${id} organisationId=${organisationId} registrationId=${registrationId} accreditationId=${lacking.accreditationId} registrationAccreditationId=${linked}`
  })
}

/**
 * Each summary log is read at its current version, given the scope it lacks
 * through the repository's version check, then audited. Once written, an
 * audit failure is logged with the scope and versions for reconciliation and
 * counted apart from write failures.
 *
 * @param {Omit<Repositories, 'organisationsRepository'> & { organisationsRepository: OrganisationLookup }} repositories
 * @param {SummaryLogId} id
 * @param {boolean} isDryRun
 * @param {TypedLogger} logger
 * @returns {Promise<Omit<BackfillResult, 'missing' | 'failed'> | null>} null if gone
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
  const outcome = {
    inFlight: 0,
    mapped: 0,
    unmapped: 0,
    yearSet: 0,
    linkDiffers: 0,
    auditFailed: 0
  }
  if (IN_FLIGHT_STATUSES.has(summaryLog.status)) {
    return { ...outcome, inFlight: 1 }
  }

  const { lacking, unmapped, ...link } = await scopeLacking(
    organisationsRepository,
    summaryLog
  )
  if (unmapped) {
    reportUnmapped(id, summaryLog, unmapped, logger)
    outcome.unmapped = 1
  }
  if ('linked' in link) {
    reportLinkDiffers(id, summaryLog, lacking, link.linked, logger)
    outcome.linkDiffers = 1
  }
  outcome.mapped = Number('accreditationNumber' in lacking)
  outcome.yearSet = Number('year' in lacking)
  if (Object.keys(lacking).length === 0 || isDryRun) {
    return outcome
  }

  await summaryLogsRepository.assignScope(id, version, lacking)

  try {
    await auditSummaryLogScopeBackfill(systemLogsRepository, {
      summaryLogId: id,
      organisationId: summaryLog.organisationId,
      registrationId: summaryLog.registrationId,
      previous: { version },
      next: { ...lacking, version: version + 1 }
    })
  } catch (error) {
    logger.error({
      err: error,
      message: `Scope written but audit failed for summary log ${id}: ${JSON.stringify(lacking)}, version ${version} -> ${version + 1}`
    })
    return { ...outcome, auditFailed: 1 }
  }

  return outcome
}

/**
 * Gives each summary log stored before summary logs were scoped by
 * accreditation and year the accreditation its spreadsheet names and the
 * year it was uploaded in. Logs one line for each summary log whose
 * accreditation it cannot give, saying why.
 *
 * @param {Repositories & { logger: TypedLogger }} deps
 * @param {{ isDryRun: boolean }} options
 * @returns {Promise<BackfillResult>}
 */
export const backfillSummaryLogScope = async (
  { logger, organisationsRepository, ...repositories },
  { isDryRun }
) => {
  const reading = {
    ...repositories,
    organisationsRepository: readingEachOrganisationOnce(
      organisationsRepository
    )
  }
  const ids = await repositories.summaryLogsRepository.findIdsWithoutScope()
  /** @type {BackfillResult} */
  const result = {
    missing: ids.length,
    inFlight: 0,
    mapped: 0,
    unmapped: 0,
    yearSet: 0,
    linkDiffers: 0,
    failed: 0,
    auditFailed: 0
  }

  for (const id of ids) {
    try {
      const outcome = await backfillOne(reading, id, isDryRun, logger) // NOSONAR(javascript:S9382) one at a time, to spare the database
      for (const [count, value] of Object.entries(outcome ?? {})) {
        result[/** @type {keyof BackfillResult} */ (count)] += value
      }
    } catch (error) {
      logger.error({
        err: error,
        message: `Failed to backfill the scope of summary log ${id}`
      })
      result.failed++
    }
  }

  return result
}
