import { VERSION_STATUS } from '#domain/waste-records/model.js'
import { ROW_OUTCOME } from '#domain/summary-logs/table-schemas/validation-pipeline.js'
import { MONTHS_PER_PERIOD } from '#reports/domain/cadence.js'
import { REPORT_STATUS } from '#reports/domain/report-status.js'

/** @import {ValidatedWasteRecord} from '#application/waste-records/transform-from-summary-log.js' */
/** @import {PeriodicReport} from '#reports/repository/port.js' */
/** @import {WasteRecord} from '#domain/waste-records/model.js' */
/** @import {WasteBalanceClassificationResult, OverseasSitesContext} from '#domain/summary-logs/table-schemas/validation-pipeline.js' */
/** @import {Accreditation} from '#domain/organisations/accreditation.js' */

/**
 * @typedef {{ count: number, tonnageDelta: number }} PeriodStatusBucket
 */

/**
 * @typedef {{ included: PeriodStatusBucket, excluded: PeriodStatusBucket }} PeriodStatusGroup
 */

/**
 * @typedef {{ added: PeriodStatusGroup, adjusted: PeriodStatusGroup }} PeriodStatusByRecordChange
 */

/**
 * @typedef {{ open: PeriodStatusByRecordChange, closed: PeriodStatusByRecordChange }} LoadsByPeriodStatus
 */

/**
 * @typedef {Object} ClassificationContext
 * @property {Accreditation | null} accreditation
 * @property {OverseasSitesContext} overseasSites
 */

/**
 * A single fold entry produced by classifying one record.
 * @typedef {Object} PeriodStatusEntry
 * @property {'open' | 'closed'} period
 * @property {'added' | 'adjusted'} change
 * @property {'included' | 'excluded'} inclusion
 * @property {number} count - 1 for the record's home bucket, 0 for reversal-only entries
 * @property {number} tonnageDelta
 */

/** @returns {LoadsByPeriodStatus} */
const emptyResult = () => ({
  open: {
    added: {
      included: { count: 0, tonnageDelta: 0 },
      excluded: { count: 0, tonnageDelta: 0 }
    },
    adjusted: {
      included: { count: 0, tonnageDelta: 0 },
      excluded: { count: 0, tonnageDelta: 0 }
    }
  },
  closed: {
    added: {
      included: { count: 0, tonnageDelta: 0 },
      excluded: { count: 0, tonnageDelta: 0 }
    },
    adjusted: {
      included: { count: 0, tonnageDelta: 0 },
      excluded: { count: 0, tonnageDelta: 0 }
    }
  }
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
    if (!slots) continue
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
    if (!dateValue) continue

    hasAnyDate = true
    const period = monthToPeriod(extractMonth(dateValue), cadence)
    const periodKey = `${extractYear(dateValue)}:${period}`
    if (closedPeriods.has(periodKey)) {
      return 'closed'
    }
  }

  return hasAnyDate ? 'open' : null
}

/**
 * @param {ValidatedWasteRecord['record']} record
 * @param {string} summaryLogId
 * @returns {'added' | 'adjusted' | 'unchanged'}
 */
const determineRecordStatus = (record, summaryLogId) => {
  const lastVersion = record.versions[record.versions.length - 1]
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
 * Classifies an added record into a single entry.
 *
 * @param {Object} params
 * @param {'open' | 'closed'} params.period
 * @param {boolean} params.isIncluded
 * @param {number} params.transactionAmount
 * @returns {PeriodStatusEntry[]}
 */
const classifyAddedRecord = ({ period, isIncluded, transactionAmount }) => [
  {
    period,
    change: 'added',
    inclusion: isIncluded ? 'included' : 'excluded',
    count: 1,
    tonnageDelta: isIncluded ? transactionAmount : 0
  }
]

/**
 * Classifies an adjusted record into 1-2 entries.
 *
 * When old and new dates map to the same period, this produces a single
 * entry with the net delta (newAmount - oldAmount). When they differ,
 * the old period gets -oldAmount and the new period gets +newAmount.
 *
 * @param {Object} params
 * @param {'open' | 'closed' | null} params.oldPeriod
 * @param {'open' | 'closed' | null} params.newPeriod
 * @param {boolean} params.isIncluded
 * @param {number} params.oldAmount
 * @param {number} params.newAmount
 * @returns {PeriodStatusEntry[]}
 */
const classifyAdjustedRecord = ({
  oldPeriod,
  newPeriod,
  isIncluded,
  oldAmount,
  newAmount
}) => {
  const inclusion = isIncluded ? 'included' : 'excluded'
  const countedPeriod = newPeriod ?? oldPeriod
  /** @type {PeriodStatusEntry[]} */
  const entries = []

  if (oldPeriod) {
    entries.push({
      period: oldPeriod,
      change: 'adjusted',
      inclusion,
      count: 0,
      tonnageDelta: -oldAmount
    })
  }

  if (newPeriod) {
    entries.push({
      period: newPeriod,
      change: 'adjusted',
      inclusion,
      count: 0,
      tonnageDelta: newAmount
    })
  }

  // Assign the count to the record's "home" bucket (new period, or old if new is null).
  // The caller guards with (newPeriod || oldPeriod), so countedPeriod is always defined.
  const countEntry = /** @type {PeriodStatusEntry} */ (
    entries.find((e) => e.period === countedPeriod)
  )
  countEntry.count = 1

  return entries
}

/**
 * Folds an array of entries into the LoadsByPeriodStatus structure.
 *
 * @param {PeriodStatusEntry[]} entries
 * @returns {LoadsByPeriodStatus}
 */
const reduceEntries = (entries) => {
  const result = emptyResult()

  for (const { period, change, inclusion, count, tonnageDelta } of entries) {
    const bucket = result[period][change][inclusion]
    bucket.count += count
    bucket.tonnageDelta += tonnageDelta
  }

  return result
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
 * @param {Record<string, { reportingDateFields: string[], wasteRecordType: string, classifyForWasteBalance?: Function }>} params.tableSchemas
 * @param {ClassificationContext} params.classificationContext
 * @returns {LoadsByPeriodStatus}
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

  const classify = (
    /** @type {Record<string, string | Date | null | undefined>} */ data,
    /** @type {string[]} */ reportingDateFields
  ) => classifyPeriodStatus(data, reportingDateFields, closedPeriods, cadence)

  /** @type {PeriodStatusEntry[]} */
  const entries = []

  for (const wasteRecord of wasteRecords) {
    const { record, outcome } = wasteRecord

    if (outcome === ROW_OUTCOME.IGNORED) continue

    const status = determineRecordStatus(record, summaryLogId)
    if (status === 'unchanged') continue

    const schema = tableSchemas[wasteRecord.tableName]
    if (!schema) continue

    const { reportingDateFields } = schema
    const isIncluded = outcome === ROW_OUTCOME.INCLUDED

    if (status === 'added') {
      const period = classify(record.data, reportingDateFields)
      if (period) {
        const transactionAmount = getTransactionAmount(
          schema,
          record.data,
          classificationContext
        )
        entries.push(
          ...classifyAddedRecord({ period, isIncluded, transactionAmount })
        )
      }
      continue
    }

    // Adjusted record: classify old and new dates independently
    const newPeriod = classify(record.data, reportingDateFields)
    const existingKey = `${record.type}:${record.rowId}`
    const existing = existingRecordsMap.get(existingKey)
    const oldPeriod = existing
      ? classify(existing.data, reportingDateFields)
      : null

    const newAmount = getTransactionAmount(
      schema,
      record.data,
      classificationContext
    )
    const oldAmount = existing
      ? getTransactionAmount(schema, existing.data, classificationContext)
      : 0

    if (newPeriod || oldPeriod) {
      entries.push(
        ...classifyAdjustedRecord({
          oldPeriod,
          newPeriod,
          isIncluded,
          oldAmount,
          newAmount
        })
      )
    }
  }

  return reduceEntries(entries)
}
