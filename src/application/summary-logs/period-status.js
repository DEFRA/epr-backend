import { VERSION_STATUS } from '#domain/waste-records/model.js'
import { ROW_OUTCOME } from '#domain/summary-logs/table-schemas/validation-pipeline.js'
import { MONTHS_PER_PERIOD } from '#reports/domain/cadence.js'
import { REPORT_STATUS } from '#reports/domain/report-status.js'
import { roundToTwoDecimalPlaces } from '#common/helpers/decimal-utils.js'

/** Internal reporting-period status. Not serialised: mapped to output keys via PERIOD_TO_KEY. */
const PERIOD_STATUS = Object.freeze({ OPEN: 'open', CLOSED: 'closed' })

/** @import {ValidatedWasteRecord} from '#application/waste-records/transform-from-summary-log.js' */
/** @import {PeriodicReport} from '#reports/repository/port.js' */
/** @import {WasteRecord} from '#domain/waste-records/model.js' */
/** @import {OverseasSitesContext} from '#domain/summary-logs/table-schemas/validation-pipeline.js' */
/** @import {TableSchema} from '#domain/summary-logs/table-schemas/index.js' */
/** @import {PROCESSING_TYPE_TABLES} from '#domain/summary-logs/table-schemas/index.js' */
/** @import {Accreditation} from '#domain/organisations/accreditation.js' */

/** @typedef {typeof PROCESSING_TYPE_TABLES[keyof typeof PROCESSING_TYPE_TABLES]} ProcessingTypeSchemas */

/**
 * @typedef {{ count: number, tonnageDelta: number }} BalanceAffectingBucket
 */

/**
 * @typedef {{ count: number }} NonBalanceAffectingBucket
 */

/**
 * @typedef {{ balanceAffecting: BalanceAffectingBucket, nonBalanceAffecting: NonBalanceAffectingBucket }} PeriodStatusGroup
 */

/**
 * @typedef {{ added: PeriodStatusGroup, adjusted: PeriodStatusGroup }} PeriodStatusByRecordChange
 */

/**
 * @typedef {{ openPeriodLoads: PeriodStatusByRecordChange, closedPeriodLoads: PeriodStatusByRecordChange }} LoadsByReportingPeriod
 */

/**
 * @typedef {Object} ClassificationContext
 * @property {Accreditation | null} accreditation
 * @property {OverseasSitesContext} overseasSites
 */

/**
 * A single fold entry produced by classifying one record. Each entry is one
 * leg: a record's net contribution to a single period's balance. Inclusion is
 * derived from tonnageDelta at fold time, not stored here.
 * @typedef {Object} PeriodStatusEntry
 * @property {'open' | 'closed'} period
 * @property {'added' | 'adjusted'} change
 * @property {number} count - 1 for the record's home leg, 0 for reversal-only legs
 * @property {number} tonnageDelta - rounded to 2dp; non-zero means balanceAffecting
 */

/** @returns {PeriodStatusByRecordChange} */
const emptyChange = () => ({
  added: {
    balanceAffecting: { count: 0, tonnageDelta: 0 },
    nonBalanceAffecting: { count: 0 }
  },
  adjusted: {
    balanceAffecting: { count: 0, tonnageDelta: 0 },
    nonBalanceAffecting: { count: 0 }
  }
})

/** @returns {LoadsByReportingPeriod} */
const emptyResult = () => ({
  openPeriodLoads: emptyChange(),
  closedPeriodLoads: emptyChange()
})

/** Position of the year portion end in an ISO date string (YYYY-MM-DD) */
const YEAR_END = 4
/** Start and end of the month portion in an ISO date string */
const MONTH_START = 5
const MONTH_END = 7

/**
 * @param {string | Date} dateValue
 * @returns {string}
 */
const toIsoDate = (dateValue) =>
  dateValue instanceof Date
    ? dateValue.toISOString().slice(0, 10)
    : String(dateValue)

/**
 * @param {string | Date} dateValue
 * @returns {number}
 */
const extractMonth = (dateValue) => {
  const str = toIsoDate(dateValue)
  return Number(str.slice(MONTH_START, MONTH_END))
}

/**
 * @param {string | Date} dateValue
 * @returns {number}
 */
const extractYear = (dateValue) =>
  Number(toIsoDate(dateValue).slice(0, YEAR_END))

/**
 * Maps a month to its reporting period number.
 * @param {number} month - 1-12
 * @param {string} cadence - 'monthly' or 'quarterly'
 * @returns {number}
 */
const monthToPeriod = (month, cadence) => {
  const monthsPerPeriod = MONTHS_PER_PERIOD[cadence]
  return Math.ceil(month / monthsPerPeriod)
}

/**
 * Builds a set of closed period keys from submitted reports.
 * A period is closed when it has been submitted: either the current
 * report has status 'submitted', or there are previous submissions.
 *
 * @param {PeriodicReport[]} periodicReports
 * @param {string} cadence
 * @returns {Set<string>}
 */
const buildClosedPeriods = (periodicReports, cadence) => {
  const closed = new Set()
  for (const periodicReport of periodicReports) {
    const slots = periodicReport.reports[cadence]
    if (!slots) {
      continue
    }
    for (const [period, slot] of Object.entries(slots)) {
      const hasBeenSubmitted =
        slot.current?.status === REPORT_STATUS.SUBMITTED ||
        slot.previousSubmissions?.length > 0
      if (hasBeenSubmitted) {
        closed.add(`${periodicReport.year}:${period}`)
      }
    }
  }
  return closed
}

/**
 * Applies the closed-wins rule: if ANY date field maps to a closed
 * period, the record is classified as closed.
 * Returns null if no date fields have a value.
 *
 * @param {Record<string, string | Date | null | undefined>} data
 * @param {string[]} reportingDateFields
 * @param {Set<string>} closedPeriods
 * @param {string} cadence
 * @returns {'open' | 'closed' | null}
 */
const classifyPeriodStatus = (
  data,
  reportingDateFields,
  closedPeriods,
  cadence
) => {
  let hasAnyDate = false

  for (const field of reportingDateFields) {
    const dateValue = data[field]
    if (!dateValue) {
      continue
    }

    hasAnyDate = true
    const period = monthToPeriod(extractMonth(dateValue), cadence)
    const periodKey = `${extractYear(dateValue)}:${period}`
    if (closedPeriods.has(periodKey)) {
      return PERIOD_STATUS.CLOSED
    }
  }

  return hasAnyDate ? PERIOD_STATUS.OPEN : null
}

/**
 * @param {ValidatedWasteRecord['record']} record
 * @param {string} summaryLogId
 * @returns {'added' | 'adjusted' | 'unchanged'}
 */
const determineRecordStatus = (record, summaryLogId) => {
  const lastVersion = record.versions.at(-1)
  if (lastVersion?.summaryLog?.id !== summaryLogId) {
    return 'unchanged'
  }
  return lastVersion.status === VERSION_STATUS.CREATED ? 'added' : 'adjusted'
}

/**
 * Computes the transaction amount for a record via classifyForWasteBalance.
 * Returns 0 if the schema has no classifier or the outcome is not INCLUDED.
 *
 * @param {import('#domain/summary-logs/table-schemas/index.js').TableSchema | null} schema
 * @param {Record<string, any>} data
 * @param {ClassificationContext} context
 * @returns {number}
 */
const getTransactionAmount = (schema, data, context) => {
  const result = schema?.classifyForWasteBalance?.(data, context)
  return result?.outcome === ROW_OUTCOME.INCLUDED ? result.transactionAmount : 0
}

/**
 * Classifies an added record into a single leg. The transaction amount is
 * already 0 for records excluded from the waste balance, so a zero delta
 * naturally falls into nonBalanceAffecting at fold time.
 *
 * @param {Object} params
 * @param {'open' | 'closed'} params.period
 * @param {number} params.transactionAmount
 * @returns {PeriodStatusEntry[]}
 */
const classifyAddedRecord = ({ period, transactionAmount }) => [
  {
    period,
    change: 'added',
    count: 1,
    tonnageDelta: roundToTwoDecimalPlaces(transactionAmount)
  }
]

/**
 * Classifies an adjusted record into 1-2 legs by accumulating each period's
 * net delta. When old and new dates map to the same period the reversal
 * (-oldAmount) and addition (+newAmount) merge into one net leg; when they
 * differ the old period gets -oldAmount and the new period gets +newAmount.
 * Each leg's delta is rounded to 2dp so the fold can decide inclusion from it.
 *
 * @param {Object} params
 * @param {'open' | 'closed' | null} params.oldPeriod
 * @param {'open' | 'closed' | null} params.newPeriod
 * @param {number} params.oldAmount
 * @param {number} params.newAmount
 * @returns {PeriodStatusEntry[]}
 */
const classifyAdjustedRecord = ({
  oldPeriod,
  newPeriod,
  oldAmount,
  newAmount
}) => {
  /** @type {Map<'open' | 'closed', number>} */
  const legs = new Map()
  if (oldPeriod) {
    legs.set(oldPeriod, (legs.get(oldPeriod) ?? 0) - oldAmount)
  }
  if (newPeriod) {
    legs.set(newPeriod, (legs.get(newPeriod) ?? 0) + newAmount)
  }

  // The record's count lives on its "home" leg (new period, or old if new is
  // null). The caller guards with (newPeriod || oldPeriod), so it is defined.
  const homePeriod = newPeriod ?? oldPeriod

  return [...legs].map(([period, tonnageDelta]) => ({
    period,
    change: 'adjusted',
    count: period === homePeriod ? 1 : 0,
    tonnageDelta: roundToTwoDecimalPlaces(tonnageDelta)
  }))
}

/**
 * Maps a record's internal period status to its output bucket key.
 * @type {Record<'open' | 'closed', 'openPeriodLoads' | 'closedPeriodLoads'>}
 */
const PERIOD_TO_KEY = {
  [PERIOD_STATUS.OPEN]: 'openPeriodLoads',
  [PERIOD_STATUS.CLOSED]: 'closedPeriodLoads'
}

/**
 * Folds an array of entries into the LoadsByReportingPeriod structure.
 *
 * @param {PeriodStatusEntry[]} entries
 * @returns {LoadsByReportingPeriod}
 */
const reduceEntries = (entries) => {
  const result = emptyResult()

  for (const { period, change, count, tonnageDelta } of entries) {
    const group = result[PERIOD_TO_KEY[period]][change]
    // A leg with no net delta is nonBalanceAffecting; any movement (rounded)
    // goes to balanceAffecting.
    if (tonnageDelta === 0) {
      group.nonBalanceAffecting.count += count
    } else {
      group.balanceAffecting.count += count
      group.balanceAffecting.tonnageDelta += tonnageDelta
    }
  }

  // Each leg's delta is already 2dp, but summing many of them can reintroduce
  // IEEE-754 noise (eg 0.1 + 0.2 = 0.30000…004); round each bucket total once.
  for (const period of Object.values(result)) {
    for (const change of Object.values(period)) {
      change.balanceAffecting.tonnageDelta = roundToTwoDecimalPlaces(
        change.balanceAffecting.tonnageDelta
      )
    }
  }

  return result
}

/**
 * Produces fold entries for a single adjusted record.
 *
 * @param {Object} params
 * @param {ValidatedWasteRecord} params.wasteRecord
 * @param {Map<string, WasteRecord>} params.existingRecordsMap
 * @param {TableSchema} params.schema
 * @param {Set<string>} params.closedPeriods
 * @param {'monthly' | 'quarterly'} params.cadence
 * @param {ClassificationContext} params.context
 * @returns {PeriodStatusEntry[]}
 */
const classifyAdjustedWasteRecord = ({
  wasteRecord,
  existingRecordsMap,
  schema,
  closedPeriods,
  cadence,
  context
}) => {
  const { record } = wasteRecord
  const { reportingDateFields } = schema

  const newPeriod = classifyPeriodStatus(
    record.data,
    reportingDateFields,
    closedPeriods,
    cadence
  )
  const existingKey = `${record.type}:${record.rowId}`
  const existing = existingRecordsMap.get(existingKey)
  const oldPeriod = existing
    ? classifyPeriodStatus(
        existing.data,
        reportingDateFields,
        closedPeriods,
        cadence
      )
    : null

  if (!newPeriod && !oldPeriod) {
    return []
  }

  const newAmount = getTransactionAmount(schema, record.data, context)
  const oldAmount = existing
    ? getTransactionAmount(schema, existing.data, context)
    : 0

  return classifyAdjustedRecord({
    oldPeriod,
    newPeriod,
    oldAmount,
    newAmount
  })
}

/**
 * Classifies waste records by reporting period status (open/closed).
 *
 * Each record produces 0-2 fold entries which are then reduced into the
 * final nested structure. Pure function with no I/O.
 *
 * @param {Object} params
 * @param {ValidatedWasteRecord[]} params.wasteRecords
 * @param {Map<string, WasteRecord>} params.existingRecordsMap
 * @param {PeriodicReport[]} params.periodicReports
 * @param {'monthly' | 'quarterly'} params.cadence
 * @param {string} params.summaryLogId
 * @param {ProcessingTypeSchemas} params.tableSchemas
 * @param {ClassificationContext} params.classificationContext
 * @returns {LoadsByReportingPeriod}
 */
export const classifyByPeriodStatus = ({
  wasteRecords,
  existingRecordsMap,
  periodicReports,
  cadence,
  summaryLogId,
  tableSchemas,
  classificationContext
}) => {
  const closedPeriods = buildClosedPeriods(periodicReports, cadence)

  /** @type {PeriodStatusEntry[]} */
  const entries = []

  for (const wasteRecord of wasteRecords) {
    const { record, outcome } = wasteRecord
    const status = determineRecordStatus(record, summaryLogId)
    const schema = tableSchemas[wasteRecord.tableName]

    if (outcome === ROW_OUTCOME.IGNORED || status === 'unchanged' || !schema) {
      continue
    }

    if (status === 'added') {
      const period = classifyPeriodStatus(
        record.data,
        schema.reportingDateFields,
        closedPeriods,
        cadence
      )
      if (period) {
        const amount = getTransactionAmount(
          schema,
          record.data,
          classificationContext
        )
        entries.push(
          ...classifyAddedRecord({
            period,
            transactionAmount: amount
          })
        )
      }
    } else {
      entries.push(
        ...classifyAdjustedWasteRecord({
          wasteRecord,
          existingRecordsMap,
          schema,
          closedPeriods,
          cadence,
          context: classificationContext
        })
      )
    }
  }

  return reduceEntries(entries)
}
