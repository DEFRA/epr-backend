import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'

import { sweepNumbersBackfillByReason } from '#common/helpers/numbers-backfill.js'
import { numbersFor } from '#domain/organisations/numbers.js'
import { numbersHeld } from '#packaging-recycling-notes/domain/numbers.js'
import { auditPrnNumbersBackfill } from './audit.js'

/** @import { TypedLogger } from '#common/hapi-types.js' */
/** @import { ReasonedBackfillResult } from '#common/helpers/numbers-backfill.js' */
/** @import { OrganisationsRepository } from '#repositories/organisations/port.js' */
/** @import { PackagingRecyclingNote } from '#packaging-recycling-notes/domain/model.js' */
/** @import { PackagingRecyclingNotesRepository, PrnNumbers } from '#packaging-recycling-notes/repository/port.js' */
/** @import { SystemLogsRepository } from '#repositories/system-logs/port.js' */

/**
 * @typedef {Object} Repositories
 * @property {PackagingRecyclingNotesRepository} prnRepository
 * @property {SystemLogsRepository} systemLogsRepository
 * @property {OrganisationsRepository} organisationsRepository
 */

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
    const holdsRegistration = organisation.registrations.some(
      ({ id }) => id === prn.registrationId
    )
    /** @type {Record<keyof PrnNumbers, string>} */
    const reasons = {
      organisationNumber: 'no organisation number',
      registrationNumber: holdsRegistration
        ? 'no registration number'
        : 'registration not found'
    }
    const unmapped = Object.entries(reasons)
      .filter(([key]) => numbers[key] === undefined && held[key] === undefined)
      .map(([, reason]) => reason)
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
 * Adds to each PRN the organisation and registration numbers it lacks, read
 * from its organisation record.
 *
 * @param {Repositories & { logger: TypedLogger }} deps
 * @param {{ isDryRun: boolean }} options
 * @returns {Promise<ReasonedBackfillResult>}
 */
export const backfillPrnNumbers = async (
  { logger, ...repositories },
  { isDryRun }
) =>
  sweepNumbersBackfillByReason({
    ids: await repositories.prnRepository.findIdsWithoutNumbers(),
    backfillOne: (id) => backfillOne(repositories, id, isDryRun, logger),
    documentName: 'PRN',
    logger
  })
