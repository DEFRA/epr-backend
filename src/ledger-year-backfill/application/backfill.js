import { safeAudit, SYSTEM_USER } from '#auditing/helpers.js'
import { utcYearOf } from '#common/helpers/dates/year.js'

/** @import { TypedLogger } from '#common/hapi-types.js' */
/** @import { RequiredNumbers } from '#domain/organisations/numbers.js' */
/** @import { SystemLogsRepository } from '#repositories/system-logs/port.js' */
/** @import { LedgerRecordCounts, YearlessLedgers } from '../mongodb.js' */

export const YEAR_BACKFILL_ACTION = 'year-backfill-migration'

/**
 * Until ledgers were kept apart by year, 2026 was the only accreditation
 * year, so every ledger event and row state stored without a year is 2026's.
 */
const ONLY_YEAR_BEFORE_YEARS_WERE_KEPT_APART = utcYearOf('2026-01-01')

/**
 * @typedef {Object} BackfillResult
 * @property {number} ledgers - ledgers given their year (would be, on a dry run)
 * @property {number} events - ledger events given their year
 * @property {number} rowStates - row states given their year
 * @property {number} unplaced - ledgers left alone because they already hold records for the year
 * @property {number} failed - ledgers not written; retried on the next run
 * @property {number} auditFailed - ledgers written but not audited
 */

/**
 * @typedef {Object} Repositories
 * @property {YearlessLedgers} ledgers
 * @property {SystemLogsRepository} systemLogsRepository
 */

/** @param {RequiredNumbers} numbers */
const describeLedger = ({
  organisationNumber,
  registrationNumber,
  accreditationNumber
}) =>
  `organisationNumber=${organisationNumber} registrationNumber=${registrationNumber} accreditationNumber=${accreditationNumber}`

/**
 * @param {SystemLogsRepository} systemLogsRepository
 * @param {RequiredNumbers} numbers
 * @param {LedgerRecordCounts} counts
 */
const auditYearAssigned = async (systemLogsRepository, numbers, counts) => {
  const payload = {
    event: {
      category: 'waste-reporting',
      subCategory: 'waste-balance',
      action: YEAR_BACKFILL_ACTION
    },
    context: {
      ...numbers,
      year: ONLY_YEAR_BEFORE_YEARS_WERE_KEPT_APART,
      ...counts
    },
    user: SYSTEM_USER
  }

  safeAudit(payload)

  await systemLogsRepository.insert({
    createdAt: new Date(),
    createdBy: SYSTEM_USER,
    event: payload.event,
    context: payload.context
  })
}

/**
 * Gives one ledger's yearless records their year and audits the change once
 * for the ledger. A ledger already holding records for that year is left
 * alone: its yearless events can share event numbers with them, which the
 * unique ledger slot would refuse.
 *
 * @param {Repositories} repositories
 * @param {RequiredNumbers} numbers
 * @param {boolean} isDryRun
 * @param {TypedLogger} logger
 * @returns {Promise<Omit<BackfillResult, 'failed'>>}
 */
const backfillLedger = async (
  { ledgers, systemLogsRepository },
  numbers,
  isDryRun,
  logger
) => {
  const year = ONLY_YEAR_BEFORE_YEARS_WERE_KEPT_APART
  if (await ledgers.holdsYear(numbers, year)) {
    logger.error({
      message: `Ledger year backfill cannot place ledger ${describeLedger(numbers)}: it holds records for ${year} alongside records without a year`
    })
    return {
      ledgers: 0,
      events: 0,
      rowStates: 0,
      unplaced: 1,
      auditFailed: 0
    }
  }

  const counts = isDryRun
    ? await ledgers.countYearless(numbers)
    : await ledgers.assignYear(numbers, year)
  const outcome = { ledgers: 1, ...counts, unplaced: 0, auditFailed: 0 }
  if (isDryRun) {
    return outcome
  }

  try {
    await auditYearAssigned(systemLogsRepository, numbers, counts)
  } catch (error) {
    logger.error({
      err: error,
      message: `Year written but audit failed for ledger ${describeLedger(numbers)}: events=${counts.events} rowStates=${counts.rowStates}`
    })
    return { ...outcome, auditFailed: 1 }
  }

  return outcome
}

/**
 * Gives every ledger event and row state stored before ledgers were kept
 * apart by year the year it belongs to. Logs at error level each ledger it
 * cannot place, naming it.
 *
 * @param {Repositories & { logger: TypedLogger }} deps
 * @param {{ isDryRun: boolean }} options
 * @returns {Promise<BackfillResult>}
 */
export const backfillLedgerYear = async (
  { logger, ...repositories },
  { isDryRun }
) => {
  /** @type {BackfillResult} */
  const result = {
    ledgers: 0,
    events: 0,
    rowStates: 0,
    unplaced: 0,
    failed: 0,
    auditFailed: 0
  }

  for (const numbers of await repositories.ledgers.findYearless()) {
    try {
      const outcome = await backfillLedger(
        repositories,
        numbers,
        isDryRun,
        logger
      ) // NOSONAR(javascript:S9382) one at a time, to spare the database
      for (const [count, value] of Object.entries(outcome)) {
        result[/** @type {keyof BackfillResult} */ (count)] += value
      }
    } catch (error) {
      logger.error({
        err: error,
        message: `Failed to backfill the year of ledger ${describeLedger(numbers)}`
      })
      result.failed++
    }
  }

  return result
}
