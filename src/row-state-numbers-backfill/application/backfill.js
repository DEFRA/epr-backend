import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'

import { sweepNumbersBackfill } from '#common/helpers/numbers-backfill.js'
import { numbersFor } from '#domain/organisations/numbers.js'
import { auditRowStateNumbersBackfill } from './audit.js'

/** @import { TypedLogger } from '#common/hapi-types.js' */
/** @import { ReasonedBackfillResult } from '#common/helpers/numbers-backfill.js' */
/** @import { OrganisationsRepository } from '#repositories/organisations/port.js' */
/** @import { SystemLogsRepository } from '#repositories/system-logs/port.js' */
/** @import { SummaryLogRowStatesRepository, WasteBalanceLedgerId } from '#waste-records/repository/port.js' */
/** @import { RowStateNumbers } from '#waste-records/repository/schema.js' */

/**
 * @typedef {Object} Repositories
 * @property {SummaryLogRowStatesRepository} summaryLogRowStatesRepository
 * @property {SystemLogsRepository} systemLogsRepository
 * @property {OrganisationsRepository} organisationsRepository
 */

/**
 * The counts are of row states. Each reason lists the ledgers it applies to,
 * each with how many of its row states lack a number.
 *
 * @typedef {ReasonedBackfillResult} RowStateBackfillResult
 */

/** @type {[keyof RowStateNumbers, string][]} */
const NO_NUMBER = [
  ['organisationNumber', 'no organisation number'],
  ['registrationNumber', 'no registration number'],
  ['accreditationNumber', 'no accreditation number']
]

/** @param {WasteBalanceLedgerId} ledgerId */
const ledgerKey = ({ organisationId, registrationId, accreditationId }) =>
  `${organisationId}/${registrationId}/${accreditationId}`

/**
 * @param {OrganisationsRepository} organisationsRepository
 * @param {WasteBalanceLedgerId} ledgerId
 * @returns {Promise<{ numbers: RowStateNumbers, unmapped: string[] }>}
 */
const lookUpNumbers = async (
  organisationsRepository,
  { organisationId, registrationId, accreditationId }
) => {
  try {
    const organisation = await organisationsRepository.findById(organisationId)
    const { numbers } = numbersFor(organisation, {
      registrationId,
      accreditationId
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
 * A ledger's row states are given the numbers they lack in one write, then
 * audited once. Once written, an audit failure is logged with the numbers
 * for reconciliation and counted apart from write failures.
 *
 * @param {Repositories} repositories
 * @param {{ ledgerId: WasteBalanceLedgerId, documents: number }} lacking
 * @param {boolean} isDryRun
 * @param {TypedLogger} logger
 * @returns {Promise<{ documents: number, mapped: number, unmapped: string[], auditFailed: boolean }>}
 */
const backfillLedger = async (
  {
    summaryLogRowStatesRepository,
    systemLogsRepository,
    organisationsRepository
  },
  { ledgerId, documents },
  isDryRun,
  logger
) => {
  const { numbers, unmapped } = await lookUpNumbers(
    organisationsRepository,
    ledgerId
  )
  const outcome = { documents, mapped: 0, unmapped, auditFailed: false }
  if (Object.keys(numbers).length === 0) {
    return outcome
  }
  if (isDryRun) {
    return { ...outcome, mapped: documents }
  }

  const rowStates = await summaryLogRowStatesRepository.assignNumbers(
    ledgerId,
    numbers
  )

  try {
    await auditRowStateNumbersBackfill(systemLogsRepository, {
      ...ledgerId,
      rowStates,
      next: numbers
    })
  } catch (error) {
    logger.error({
      err: error,
      message: `Numbers written but audit failed for ${rowStates} row states of ledger ${ledgerKey(ledgerId)}: ${JSON.stringify(numbers)}`
    })
    return { ...outcome, mapped: rowStates, auditFailed: true }
  }

  return { ...outcome, mapped: rowStates }
}

/**
 * Adds to each row state the organisation, registration and accreditation
 * numbers it lacks, read from its organisation record. Row states share their
 * ledger's ids, so each ledger is looked up, written and audited once.
 *
 * @param {Repositories & { logger: TypedLogger }} deps
 * @param {{ isDryRun: boolean }} options
 * @returns {Promise<RowStateBackfillResult>}
 */
export const backfillRowStateNumbers = async (
  { logger, ...repositories },
  { isDryRun }
) => {
  const lacking =
    await repositories.summaryLogRowStatesRepository.findLedgerIdsWithoutNumbers()
  const byKey = new Map(
    lacking.map((entry) => [ledgerKey(entry.ledgerId), entry])
  )

  /** @type {RowStateBackfillResult} */
  const result = {
    missing: lacking.reduce((sum, { documents }) => sum + documents, 0),
    mapped: 0,
    unmapped: 0,
    unmappedReasons: {},
    failed: 0,
    auditFailed: 0
  }

  result.failed = await sweepNumbersBackfill({
    ids: [...byKey.keys()],
    backfillOne: (key) =>
      backfillLedger(
        repositories,
        /** @type {{ ledgerId: WasteBalanceLedgerId, documents: number }} */ (
          byKey.get(key)
        ),
        isDryRun,
        logger
      ),
    tally: (key, { documents, mapped, unmapped, auditFailed }) => {
      result.mapped += mapped
      result.unmapped += unmapped.length > 0 ? documents : 0
      for (const reason of unmapped) {
        result.unmappedReasons[reason] = [
          ...(result.unmappedReasons[reason] ?? []),
          `${key} (${documents})`
        ]
      }
      result.auditFailed += Number(auditFailed)
    },
    documentName: 'row states of ledger',
    logger
  })

  return result
}
