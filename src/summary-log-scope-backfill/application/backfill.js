import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'

import { utcYearOf } from '#common/helpers/dates/year.js'
import { REGISTERED_ONLY_PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
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
 * @property {number} mapped - given at least one field (would be, on a dry run)
 * @property {number} unmapped - left without an accreditation, each logged with the reason
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
 * Summary logs were scoped by year from 2026-10-02, so every summary log
 * stored without a year was uploaded in that year.
 */
const YEAR_BEFORE_SCOPING = utcYearOf('2026-10-02')

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
 * The accreditation a summary log was uploaded for, read from the number its
 * spreadsheet names and checked against its organisation.
 *
 * @param {OrganisationsRepository} organisationsRepository
 * @param {SummaryLog} summaryLog
 * @returns {Promise<{ scope: SummaryLogScope } | { unmapped: string }>}
 */
const lookUpAccreditation = async (
  organisationsRepository,
  { organisationId, meta }
) => {
  const processingType = meta?.PROCESSING_TYPE
  if (!processingType) {
    return { unmapped: 'spreadsheet names no processing type' }
  }
  if (REGISTERED_ONLY_PROCESSING_TYPES.has(processingType)) {
    return { scope: { accreditationId: null, accreditationNumber: null } }
  }

  const accreditationNumber = meta?.ACCREDITATION_NUMBER?.trim()
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
  return {
    scope: {
      accreditationId: accreditation.id,
      accreditationNumber: accreditation.accreditationNumber
    }
  }
}

/**
 * The scope a summary log lacks, and why its accreditation cannot be given
 * when it cannot.
 *
 * @param {OrganisationsRepository} organisationsRepository
 * @param {SummaryLog} summaryLog
 * @returns {Promise<{ lacking: SummaryLogScope, unmapped?: string }>}
 */
const scopeLacking = async (organisationsRepository, summaryLog) => {
  const year =
    summaryLog.year === undefined ? { year: YEAR_BEFORE_SCOPING } : {}
  if (summaryLog.accreditationNumber !== undefined) {
    return { lacking: year }
  }

  const accreditation = await lookUpAccreditation(
    organisationsRepository,
    summaryLog
  )
  if ('unmapped' in accreditation) {
    return { lacking: year, unmapped: accreditation.unmapped }
  }
  return { lacking: { ...accreditation.scope, ...year } }
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
 * Each summary log is read at its current version, given the scope it lacks
 * through the repository's version check, then audited. Once written, an
 * audit failure is logged with the scope and versions for reconciliation and
 * counted apart from write failures.
 *
 * @param {Repositories} repositories
 * @param {SummaryLogId} id
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
  const outcome = {
    inFlight: false,
    mapped: false,
    unmapped: false,
    auditFailed: false
  }
  if (IN_FLIGHT_STATUSES.has(summaryLog.status)) {
    return { ...outcome, inFlight: true }
  }

  const { lacking, unmapped } = await scopeLacking(
    organisationsRepository,
    summaryLog
  )
  if (unmapped) {
    reportUnmapped(id, summaryLog, unmapped, logger)
    outcome.unmapped = true
  }
  outcome.mapped = Object.keys(lacking).length > 0
  if (!outcome.mapped || isDryRun) {
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
    return { ...outcome, auditFailed: true }
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
  { logger, ...repositories },
  { isDryRun }
) => {
  const ids = await repositories.summaryLogsRepository.findIdsWithoutScope()
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
      const outcome = await backfillOne(repositories, id, isDryRun, logger) // NOSONAR(javascript:S9382) one at a time, to spare the database
      if (outcome) {
        result.inFlight += Number(outcome.inFlight)
        result.mapped += Number(outcome.mapped)
        result.unmapped += Number(outcome.unmapped)
        result.auditFailed += Number(outcome.auditFailed)
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
