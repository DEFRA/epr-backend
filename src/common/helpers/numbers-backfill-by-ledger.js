import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'

import { sweepNumbersBackfill } from '#common/helpers/numbers-backfill.js'
import { numbersFor } from '#domain/organisations/numbers.js'

/** @import { TypedLogger } from '#common/hapi-types.js' */
/** @import { ReasonedBackfillResult } from '#common/helpers/numbers-backfill.js' */
/** @import { Numbers } from '#domain/organisations/numbers.js' */
/** @import { OrganisationsRepository } from '#repositories/organisations/port.js' */
/** @import { WasteBalanceLedgerId } from '#waste-balances/repository/ledger-schema.js' */
/** @import { LedgerLackingNumbers } from '#waste-balances/repository/ledger-port.js' */

/**
 * The documents a ledger keys, as the backfill reaches them.
 *
 * @typedef {Object} LedgerKeyedDocuments
 * @property {() => Promise<LedgerLackingNumbers[]>} findLedgerIdsWithoutNumbers
 * @property {(ledgerId: WasteBalanceLedgerId, numbers: Numbers) => Promise<number>} countLacking
 *   How many of the ledger's documents `assignNumbers` would change.
 * @property {(ledgerId: WasteBalanceLedgerId, numbers: Numbers) => Promise<number>} assignNumbers
 * @property {(ledgerId: WasteBalanceLedgerId, documents: number, numbers: Numbers) => Promise<void>} audit
 *   Audits the numbers added to one ledger's documents, with how many it changed.
 * @property {string} name - what the documents are called in a log line
 */

/**
 * The counts are of documents. Each reason lists the ledgers it applies to,
 * each with how many of its documents lack a number.
 *
 * @typedef {ReasonedBackfillResult} LedgerBackfillResult
 */

/**
 * @param {{ id: string }[]} records
 * @param {string | null} id
 */
const holds = (records, id) => records.some((record) => record.id === id)

/** @param {WasteBalanceLedgerId} ledgerId */
const ledgerKey = ({ organisationId, registrationId, accreditationId }) =>
  `${organisationId}/${registrationId}/${accreditationId}`

/**
 * The numbers the ledger's documents lack that its organisation record gives,
 * and why the rest cannot be given.
 *
 * @param {OrganisationsRepository} organisationsRepository
 * @param {LedgerLackingNumbers} ledger
 * @returns {Promise<{ numbers: Numbers, unmapped: string[] }>}
 */
const lookUpNumbers = async (
  organisationsRepository,
  { ledgerId: { organisationId, registrationId, accreditationId }, lacking }
) => {
  try {
    const organisation = await organisationsRepository.findById(organisationId)
    const { numbers } = numbersFor(organisation, {
      registrationId,
      accreditationId
    })
    /** @type {Record<keyof Numbers, string>} */
    const reasons = {
      organisationNumber: 'no organisation number',
      registrationNumber: holds(organisation.registrations, registrationId)
        ? 'no registration number'
        : 'registration not found',
      accreditationNumber: holds(organisation.accreditations, accreditationId)
        ? 'no accreditation number'
        : 'accreditation not found'
    }
    return {
      numbers: Object.fromEntries(
        lacking
          .filter((key) => numbers[key] !== undefined)
          .map((key) => [key, numbers[key]])
      ),
      unmapped: lacking
        .filter((key) => numbers[key] === undefined)
        .map((key) => reasons[key])
    }
  } catch (error) {
    if (Boom.isBoom(error, StatusCodes.NOT_FOUND)) {
      return { numbers: {}, unmapped: ['organisation not found'] }
    }
    throw error
  }
}

/**
 * A ledger's documents are given the numbers they lack in one write, then
 * audited once. Once written, an audit failure is logged with the numbers
 * for reconciliation and counted apart from write failures.
 *
 * @param {LedgerKeyedDocuments} documents
 * @param {OrganisationsRepository} organisationsRepository
 * @param {LedgerLackingNumbers} ledger
 * @param {boolean} isDryRun
 * @param {TypedLogger} logger
 * @returns {Promise<{ documents: number, mapped: number, unmapped: string[], auditFailed: boolean }>}
 */
const backfillLedger = async (
  { countLacking, assignNumbers, audit, name },
  organisationsRepository,
  ledger,
  isDryRun,
  logger
) => {
  const { ledgerId } = ledger
  const { numbers, unmapped } = await lookUpNumbers(
    organisationsRepository,
    ledger
  )
  const outcome = {
    documents: ledger.documents,
    mapped: 0,
    unmapped,
    auditFailed: false
  }
  if (Object.keys(numbers).length === 0) {
    return outcome
  }
  if (isDryRun) {
    return { ...outcome, mapped: await countLacking(ledgerId, numbers) }
  }

  const changed = await assignNumbers(ledgerId, numbers)

  try {
    await audit(ledgerId, changed, numbers)
  } catch (error) {
    logger.error({
      err: error,
      message: `Numbers written but audit failed for ${changed} ${name} of ledger ${ledgerKey(ledgerId)}: ${JSON.stringify(numbers)}`
    })
    return { ...outcome, mapped: changed, auditFailed: true }
  }

  return { ...outcome, mapped: changed }
}

/**
 * Adds to each document a ledger keys the organisation, registration and
 * accreditation numbers it lacks, read from its organisation record. The
 * documents share their ledger's ids, so each ledger is looked up, written and
 * audited once.
 *
 * @param {{ documents: LedgerKeyedDocuments, organisationsRepository: OrganisationsRepository, logger: TypedLogger }} deps
 * @param {{ isDryRun: boolean }} options
 * @returns {Promise<LedgerBackfillResult>}
 */
export const backfillNumbersByLedger = async (
  { documents, organisationsRepository, logger },
  { isDryRun }
) => {
  const lacking = await documents.findLedgerIdsWithoutNumbers()
  const byKey = new Map(
    lacking.map((entry) => [ledgerKey(entry.ledgerId), entry])
  )

  /** @type {LedgerBackfillResult} */
  const result = {
    missing: lacking.reduce((sum, entry) => sum + entry.documents, 0),
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
        documents,
        organisationsRepository,
        /** @type {LedgerLackingNumbers} */ (byKey.get(key)),
        isDryRun,
        logger
      ),
    tally: (key, outcome) => {
      result.mapped += outcome.mapped
      result.unmapped += outcome.unmapped.length > 0 ? outcome.documents : 0
      for (const reason of outcome.unmapped) {
        result.unmappedReasons[reason] = [
          ...(result.unmappedReasons[reason] ?? []),
          `${key} (${outcome.documents})`
        ]
      }
      result.auditFailed += Number(outcome.auditFailed)
    },
    documentName: `${documents.name} of ledger`,
    logger
  })

  return result
}

/**
 * Every ledger under each reason, with its document count. There are far
 * fewer ledgers than documents, so none is left out.
 *
 * @param {Record<string, string[]>} unmappedReasons
 */
export const describeUnmappedLedgers = (unmappedReasons) =>
  Object.entries(unmappedReasons)
    .map(
      ([reason, ledgers]) =>
        `${reason}: ${ledgers.length} (${ledgers.join(', ')})`
    )
    .join('; ')
