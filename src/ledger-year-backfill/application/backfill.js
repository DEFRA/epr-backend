import { safeAudit, SYSTEM_USER } from '#auditing/helpers.js'
import { utcYearOf } from '#common/helpers/dates/year.js'

/** @import { Year } from '#common/helpers/dates/year.js' */
/** @import { TypedLogger } from '#common/hapi-types.js' */
/** @import { RequiredNumbers } from '#domain/organisations/numbers.js' */
/** @import { SystemLogsRepository } from '#repositories/system-logs/port.js' */
/** @import { WasteBalanceLedgerId } from '#waste-balances/repository/ledger-schema.js' */
/** @import { LedgerRecordCounts, LedgerRecordIds, YearlessEvent, YearlessLedgers, YearlessRowState } from '../mongodb.js' */

export const YEAR_BACKFILL_ACTION = 'year-backfill-migration'

/**
 * A summary log stored without a year was submitted before summary logs were
 * scoped by year, when 2026 was the only accreditation year.
 */
const YEAR_OF_A_SUMMARY_LOG_WITHOUT_ONE = utcYearOf('2026-01-01')

/**
 * @typedef {Object} BackfillResult
 * @property {number} ledgers - ledgers, each of one year, given records (would be, on a dry run)
 * @property {Map<Year, LedgerRecordCounts>} years - records given each year
 * @property {LedgerRecordCounts} skipped - records whose sources give no single year; left without one
 * @property {number} failed - ledgers not written; retried on the next run
 * @property {number} auditFailed - ledgers written but not audited
 */

/**
 * @typedef {Object} Repositories
 * @property {YearlessLedgers} ledgers
 * @property {SystemLogsRepository} systemLogsRepository
 */

/**
 * @typedef {Object} LedgerOutcome
 * @property {Map<Year, LedgerRecordCounts>} years
 * @property {LedgerRecordCounts} skipped
 * @property {number} auditFailed
 */

/** @param {RequiredNumbers} numbers */
const describeLedger = ({
  organisationNumber,
  registrationNumber,
  accreditationNumber
}) =>
  `organisationNumber=${organisationNumber} registrationNumber=${registrationNumber} accreditationNumber=${accreditationNumber}`

/** @param {LedgerRecordCounts} counts */
const holdsAny = ({ events, rowStates }) => events + rowStates > 0

/**
 * @param {LedgerRecordCounts} a
 * @param {LedgerRecordCounts} b
 * @returns {LedgerRecordCounts}
 */
const addCounts = (a, b) => ({
  events: a.events + b.events,
  rowStates: a.rowStates + b.rowStates
})

/**
 * @param {SystemLogsRepository} systemLogsRepository
 * @param {WasteBalanceLedgerId} ledgerId
 * @param {LedgerRecordCounts} counts
 */
const auditYearAssigned = async (systemLogsRepository, ledgerId, counts) => {
  const payload = {
    event: {
      category: 'waste-reporting',
      subCategory: 'waste-balance',
      action: YEAR_BACKFILL_ACTION
    },
    context: { ...ledgerId, ...counts },
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
 * Sorts a ledger's yearless records by the year their sources give them. A
 * ledger event takes the year of the summary log or the accreditation of the
 * PRN it records. A row state takes the year of the summary logs that hold it,
 * and is skipped when they disagree. A record whose source is not found is
 * skipped too.
 *
 * @param {YearlessLedgers} ledgers
 * @param {{ events: YearlessEvent[], rowStates: YearlessRowState[] }} records
 * @returns {Promise<{ byYear: Map<Year, LedgerRecordIds>, skipped: LedgerRecordCounts }>}
 */
const sortByYear = async (ledgers, { events, rowStates }) => {
  const fileIds = [
    ...new Set([
      ...events.flatMap(({ summaryLogId }) => summaryLogId ?? []),
      ...rowStates.flatMap(({ summaryLogIds }) => summaryLogIds)
    ])
  ]
  const prnIds = [...new Set(events.flatMap(({ prnId }) => prnId ?? []))]
  const [summaryLogYears, prnYears] = await Promise.all([
    ledgers.yearsOfSummaryLogs(fileIds),
    ledgers.accreditationYearsOfPrns(prnIds)
  ])

  /** @param {string} fileId */
  const summaryLogYear = (fileId) =>
    summaryLogYears.has(fileId)
      ? (summaryLogYears.get(fileId) ?? YEAR_OF_A_SUMMARY_LOG_WITHOUT_ONE)
      : undefined

  /** @param {YearlessEvent} event */
  const eventYear = (event) =>
    event.prnId === undefined
      ? summaryLogYear(event.summaryLogId)
      : prnYears.get(event.prnId)

  /** @param {YearlessRowState} rowState */
  const rowStateYear = ({ summaryLogIds }) => {
    const years = new Set(summaryLogIds.map(summaryLogYear))
    return years.size === 1 ? [...years][0] : undefined
  }

  /** @type {Map<Year, LedgerRecordIds>} */
  const byYear = new Map()
  const skipped = { events: 0, rowStates: 0 }

  /**
   * @param {'events' | 'rowStates'} kind
   * @param {import('mongodb').ObjectId} id
   * @param {Year | undefined} year
   */
  const place = (kind, id, year) => {
    if (year === undefined) {
      skipped[kind]++
      return
    }
    const ids = byYear.get(year) ?? { events: [], rowStates: [] }
    ids[kind].push(id)
    byYear.set(year, ids)
  }

  for (const event of events) {
    place('events', event.id, eventYear(event))
  }
  for (const rowState of rowStates) {
    place('rowStates', rowState.id, rowStateYear(rowState))
  }

  return { byYear, skipped }
}

/**
 * Gives one ledger's yearless records the years their sources give them, and
 * audits the change once for each year.
 *
 * @param {Repositories} repositories
 * @param {RequiredNumbers} numbers
 * @param {boolean} isDryRun
 * @param {TypedLogger} logger
 * @returns {Promise<LedgerOutcome>}
 */
const backfillLedger = async (
  { ledgers, systemLogsRepository },
  numbers,
  isDryRun,
  logger
) => {
  const { byYear, skipped } = await sortByYear(
    ledgers,
    await ledgers.readYearless(numbers)
  )

  /**
   * @param {Year} year
   * @param {LedgerRecordCounts} counts
   * @returns {Promise<boolean>} whether the audit was recorded
   */
  const audit = async (year, counts) => {
    try {
      await auditYearAssigned(
        systemLogsRepository,
        { ...numbers, year },
        counts
      )
      return true
    } catch (error) {
      logger.error({
        err: error,
        message: `Year written but audit failed for ledger ${describeLedger(numbers)} year=${year}: events=${counts.events} rowStates=${counts.rowStates}`
      })
      return false
    }
  }

  /** @type {LedgerOutcome} */
  const outcome = { years: new Map(), skipped, auditFailed: 0 }

  for (const [year, ids] of byYear) {
    const counts = isDryRun
      ? { events: ids.events.length, rowStates: ids.rowStates.length }
      : await ledgers.assignYear(ids, year) // NOSONAR(javascript:S9382) one year at a time, to spare the database
    if (!holdsAny(counts)) {
      continue
    }
    outcome.years.set(year, counts)
    const audited = isDryRun || (await audit(year, counts)) // NOSONAR(javascript:S9382) one year at a time, to spare the database
    if (!audited) {
      outcome.auditFailed++
    }
  }

  return outcome
}

/**
 * Gives every ledger event and row state stored before they recorded their
 * year the year it belongs to.
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
    years: new Map(),
    skipped: { events: 0, rowStates: 0 },
    failed: 0,
    auditFailed: 0
  }

  /** @param {RequiredNumbers} numbers */
  const backfill = (numbers) =>
    backfillLedger(repositories, numbers, isDryRun, logger)

  for (const numbers of await repositories.ledgers.findYearless()) {
    try {
      const { years, skipped, auditFailed } = await backfill(numbers) // NOSONAR(javascript:S9382) one at a time, to spare the database
      for (const [year, counts] of years) {
        const sofar = result.years.get(year) ?? { events: 0, rowStates: 0 }
        result.years.set(year, addCounts(sofar, counts))
      }
      result.ledgers += years.size
      result.skipped = addCounts(result.skipped, skipped)
      result.auditFailed += auditFailed
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
