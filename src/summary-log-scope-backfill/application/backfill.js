import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'

import { utcYearOf } from '#common/helpers/dates/year.js'
import { REGISTERED_ONLY_PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import { metaText } from '#domain/summary-logs/stored-meta.js'
import { auditSummaryLogScopeBackfill } from './audit.js'

/** @import { TypedLogger } from '#common/hapi-types.js' */
/** @import { AccreditationNumber } from '#domain/organisations/numbers.js' */
/** @import { SummaryLog } from '#domain/summary-logs/model.js' */
/** @import { SummaryLogId } from '#domain/summary-logs/ids.js' */
/** @import { OrganisationsRepository } from '#repositories/organisations/port.js' */
/** @import { SummaryLogScope, SummaryLogsRepository } from '#repositories/summary-logs/port.js' */
/** @import { SystemLogsRepository } from '#repositories/system-logs/port.js' */

/**
 * @typedef {Object} BackfillResult
 * @property {number} missing - summary logs lacking an accreditation or a year when the run started
 * @property {number} mapped - given their accreditation (would be, on a dry run)
 * @property {number} unmapped - left without an accreditation, each logged with the reason
 * @property {number} yearSet - given their year
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
 * @param {OrganisationsRepository} organisationsRepository
 * @param {string} organisationId
 */
const findOrganisation = async (organisationsRepository, organisationId) => {
  try {
    return await organisationsRepository.findById(organisationId)
  } catch (error) {
    if (Boom.isBoom(error, StatusCodes.NOT_FOUND)) {
      return null
    }
    throw error
  }
}

/**
 * The accreditation whose number is stored with the summary log, checked
 * against its organisation.
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
  if (processingType && REGISTERED_ONLY_PROCESSING_TYPES.has(processingType)) {
    return { scope: { accreditationId: null, accreditationNumber: null } }
  }

  const accreditationNumber = metaText(meta?.ACCREDITATION_NUMBER)
  if (!accreditationNumber) {
    return { unmapped: 'no accreditation number stored with the summary log' }
  }

  const organisation =
    organisationId &&
    (await findOrganisation(organisationsRepository, organisationId))
  if (!organisation) {
    return { unmapped: `organisation ${organisationId} not found` }
  }

  const accreditation = organisation.accreditations.find(
    /** @returns {held is typeof held & { accreditationNumber: AccreditationNumber }} */
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
    summaryLog.year === undefined
      ? { year: ONLY_ACCREDITATION_YEAR_BEFORE_SCOPING }
      : {}
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

  const { lacking, unmapped } = await scopeLacking(
    organisationsRepository,
    summaryLog
  )
  if (unmapped) {
    reportUnmapped(id, summaryLog, unmapped, logger)
  }
  const outcome = {
    mapped: Number('accreditationNumber' in lacking),
    unmapped: Number(Boolean(unmapped)),
    yearSet: Number('year' in lacking),
    auditFailed: 0
  }
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
 * accreditation and year the accreditation whose number is stored with it
 * and the year it is for. Logs one line for each summary log whose
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
  /** @type {BackfillResult} */
  const result = {
    missing: ids.length,
    mapped: 0,
    unmapped: 0,
    yearSet: 0,
    failed: 0,
    auditFailed: 0
  }

  for (const id of ids) {
    try {
      const outcome = await backfillOne(repositories, id, isDryRun, logger) // NOSONAR(javascript:S9382) one at a time, to spare the database
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
