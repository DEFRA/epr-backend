import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'

import { numbersFor } from '#domain/organisations/numbers.js'
import { numbersHeld } from '#packaging-recycling-notes/domain/numbers.js'
import { auditPrnNumbersBackfill } from './audit.js'

/** @import { TypedLogger } from '#common/hapi-types.js' */
/** @import { OrganisationsRepository } from '#repositories/organisations/port.js' */
/** @import { PackagingRecyclingNote } from '#packaging-recycling-notes/domain/model.js' */
/** @import { PackagingRecyclingNotesRepository, PrnNumbers } from '#packaging-recycling-notes/repository/port.js' */
/** @import { SystemLogsRepository } from '#repositories/system-logs/port.js' */

/**
 * @typedef {Object} BackfillResult
 * @property {number} missing - PRNs lacking a number when the run started
 * @property {number} mapped - given at least one number (would be, on a dry run)
 * @property {number} unmapped - left lacking a number
 * @property {Record<string, string[]>} unmappedReasons - the ids of the PRNs left lacking a number, by reason
 * @property {number} failed - not written; retried on the next run
 * @property {number} auditFailed - written but not audited
 */

/**
 * @typedef {Object} Repositories
 * @property {PackagingRecyclingNotesRepository} prnRepository
 * @property {SystemLogsRepository} systemLogsRepository
 * @property {OrganisationsRepository} organisationsRepository
 */

/** @type {[keyof PrnNumbers, string][]} */
const NO_NUMBER = [
  ['organisationNumber', 'no organisation number'],
  ['registrationNumber', 'no registration number']
]

/**
 * The numbers the PRN's organisation record gives, and why any number the PRN
 * lacks cannot be found.
 *
 * @param {OrganisationsRepository} organisationsRepository
 * @param {PackagingRecyclingNote} prn
 * @returns {Promise<{ lacking: PrnNumbers, unmapped: string[] }>}
 */
const lookUpNumbers = async (organisationsRepository, prn) => {
  const held = numbersHeld(prn)
  try {
    const organisation = await organisationsRepository.findById(
      prn.organisation.id
    )
    const { numbers } = numbersFor(organisation, {
      registrationId: prn.registrationId
    })
    const lacking = Object.fromEntries(
      Object.entries(numbers).filter(([key]) => held[key] === undefined)
    )
    const unmapped = NO_NUMBER.filter(
      ([key]) => numbers[key] === undefined && held[key] === undefined
    ).map(([, reason]) => reason)
    return { lacking, unmapped }
  } catch (error) {
    if (Boom.isBoom(error, StatusCodes.NOT_FOUND)) {
      return { lacking: {}, unmapped: ['organisation not found'] }
    }
    throw error
  }
}

/**
 * Each PRN is given the numbers it lacks, then audited. Once written, an audit
 * failure is logged with the numbers for reconciliation and counted apart from
 * write failures.
 *
 * @param {Repositories} repositories
 * @param {string} id
 * @param {boolean} isDryRun
 * @param {TypedLogger} logger
 * @returns {Promise<{ mapped: boolean, unmapped: string[], auditFailed: boolean } | null>} null if gone
 */
const backfillOne = async (
  { prnRepository, systemLogsRepository, organisationsRepository },
  id,
  isDryRun,
  logger
) => {
  const prn = await prnRepository.findById(id)
  if (!prn) {
    return null
  }

  const { lacking, unmapped } = await lookUpNumbers(
    organisationsRepository,
    prn
  )

  const outcome = {
    mapped: Object.keys(lacking).length > 0,
    unmapped,
    auditFailed: false
  }
  if (!outcome.mapped || isDryRun) {
    return outcome
  }

  await prnRepository.assignNumbers(id, lacking)

  try {
    await auditPrnNumbersBackfill(systemLogsRepository, {
      prnId: id,
      organisationId: prn.organisation.id,
      registrationId: prn.registrationId,
      next: lacking
    })
  } catch (error) {
    logger.error({
      err: error,
      message: `Numbers written but audit failed for PRN ${id}: ${JSON.stringify(lacking)}`
    })
    return { ...outcome, auditFailed: true }
  }

  return outcome
}

/**
 * @param {BackfillResult} result
 * @param {string} id
 * @param {{ mapped: boolean, unmapped: string[], auditFailed: boolean }} outcome
 */
const tally = (result, id, outcome) => {
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

/**
 * Adds to each PRN the organisation and registration numbers it lacks, read
 * from its organisation record. Each PRN it cannot fully map is returned under
 * every reason that applies. A failure is logged and swallowed so one bad PRN
 * never stops the sweep.
 *
 * @param {Repositories & { logger: TypedLogger }} deps
 * @param {{ isDryRun: boolean }} options
 * @returns {Promise<BackfillResult>}
 */
export const backfillPrnNumbers = async (
  { logger, ...repositories },
  { isDryRun }
) => {
  const ids = await repositories.prnRepository.findIdsWithoutNumbers()
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
        tally(result, id, outcome)
      }
    } catch (error) {
      logger.error({
        err: error,
        message: `Failed to backfill numbers for PRN ${id}`
      })
      result.failed++
    }
  }

  return result
}
