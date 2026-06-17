import { VERSION_STATUS } from '#domain/waste-records/model.js'
import { ROW_OUTCOME } from '#domain/summary-logs/table-schemas/validation-pipeline.js'
import {
  buildSubmittedPeriods,
  isDateInSubmittedPeriod
} from '#reports/domain/submitted-periods.js'
import { roundToTwoDecimalPlaces } from '#common/helpers/decimal-utils.js'
import { MAX_ROWS_PER_BUCKET } from '#domain/summary-logs/loads-by-period-status-schema.js'

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
 * A single load's identity and exclusion reason codes, listed under an
 * expandable bucket. exclusionReasons is empty for an included row.
 * @typedef {{ rowId: string, wasteRecordType: string, exclusionReasons: string[] }} RowDetail
 */

/**
 * @typedef {{ count: number, tonnageDelta: number, rows: RowDetail[] }} BalanceAffectingBucket
 */

/**
 * @typedef {{ count: number, rows: RowDetail[] }} NonBalanceAffectingBucket
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
 * @property {number} count - 1 per leg, so a record counts once per period it touches
 * @property {number} tonnageDelta - rounded to 2dp; non-zero means balanceAffecting
 * @property {string} rowId - the record's row ID; carried onto every leg
 * @property {string} wasteRecordType - the schema's waste record type code (e.g. 'received', 'exported')
 * @property {string[]} exclusionReasons - distinct exclusion reason codes from the current row
 */

// Every bucket carries an expandable rows list, so the structure is uniform;
// the frontend renders rows only where its design calls for them.
/** @returns {PeriodStatusByRecordChange} */
const emptyChange = () => ({
  added: {
    balanceAffecting: { count: 0, tonnageDelta: 0, rows: [] },
    nonBalanceAffecting: { count: 0, rows: [] }
  },
  adjusted: {
    balanceAffecting: { count: 0, tonnageDelta: 0, rows: [] },
    nonBalanceAffecting: { count: 0, rows: [] }
  }
})

/** @returns {LoadsByReportingPeriod} */
const emptyResult = () => ({
  openPeriodLoads: emptyChange(),
  closedPeriodLoads: emptyChange()
})

/**
 * Applies the closed-wins rule: if ANY date field falls in a submitted
 * (closed) period, the record is classified as closed.
 * Returns null if no date fields have a value.
 *
 * @param {Record<string, string | Date | null | undefined>} data
 * @param {string[]} reportingDateFields
 * @param {Set<string>} submittedPeriods
 * @param {string} cadence
 * @returns {'open' | 'closed' | null}
 */
const classifyPeriodStatus = (
  data,
  reportingDateFields,
  submittedPeriods,
  cadence
) => {
  let hasAnyDate = false

  for (const field of reportingDateFields) {
    const dateValue = data[field]
    if (!dateValue) {
      continue
    }

    hasAnyDate = true
    if (isDateInSubmittedPeriod(submittedPeriods, dateValue, cadence)) {
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
 * Classifies a record via classifyForWasteBalance, returning both the
 * transaction amount (0 unless the outcome is INCLUDED) and the distinct
 * exclusion reason codes. Code-only and deduped: a row missing several fields
 * yields a single MISSING_REQUIRED_FIELD code, and an included row yields [].
 *
 * @param {import('#domain/summary-logs/table-schemas/index.js').TableSchema | null} schema
 * @param {Record<string, any>} data
 * @param {ClassificationContext} context
 * @returns {{ transactionAmount: number, exclusionReasons: string[] }}
 */
const classifyRow = (schema, data, context) => {
  const result = schema?.classifyForWasteBalance?.(data, context)
  const transactionAmount =
    result?.outcome === ROW_OUTCOME.INCLUDED ? result.transactionAmount : 0
  const exclusionReasons = result?.reasons
    ? [...new Set(result.reasons.map((reason) => reason.code))]
    : []
  return { transactionAmount, exclusionReasons }
}

/**
 * Classifies an added record into a single leg. The transaction amount is
 * already 0 for records excluded from the waste balance, so a zero delta
 * naturally falls into nonBalanceAffecting at fold time.
 *
 * @param {Object} params
 * @param {'open' | 'closed'} params.period
 * @param {number} params.transactionAmount
 * @param {RowDetail} params.identity
 * @returns {PeriodStatusEntry[]}
 */
const classifyAddedRecord = ({ period, transactionAmount, identity }) => [
  {
    period,
    change: 'added',
    count: 1,
    tonnageDelta: roundToTwoDecimalPlaces(transactionAmount),
    ...identity
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
 * @param {RowDetail} params.identity
 * @returns {PeriodStatusEntry[]}
 */
const classifyAdjustedRecord = ({
  oldPeriod,
  newPeriod,
  oldAmount,
  newAmount,
  identity
}) => {
  /** @type {Map<'open' | 'closed', number>} */
  const legs = new Map()
  if (oldPeriod) {
    legs.set(oldPeriod, (legs.get(oldPeriod) ?? 0) - oldAmount)
  }
  if (newPeriod) {
    legs.set(newPeriod, (legs.get(newPeriod) ?? 0) + newAmount)
  }

  // Every period a record touches counts once. A cross-period amendment thus
  // reads count:1 in both periods with signed deltas (outflow from the old,
  // inflow into the new), so the period it left does not look empty.
  return [...legs].map(([period, tonnageDelta]) => ({
    period,
    change: 'adjusted',
    count: 1,
    tonnageDelta: roundToTwoDecimalPlaces(tonnageDelta),
    ...identity
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
 * Appends a row to a bucket's list, capped at MAX_ROWS_PER_BUCKET. The bucket's
 * count still reflects the true total even when the list is truncated.
 *
 * @param {RowDetail[]} rows
 * @param {RowDetail} row
 */
const pushRow = (rows, row) => {
  if (rows.length < MAX_ROWS_PER_BUCKET) {
    rows.push(row)
  }
}

/**
 * Folds an array of entries into the LoadsByReportingPeriod structure.
 *
 * @param {PeriodStatusEntry[]} entries
 * @returns {LoadsByReportingPeriod}
 */
const reduceEntries = (entries) => {
  const result = emptyResult()

  for (const { period, change, count, tonnageDelta, ...identity } of entries) {
    const group = result[PERIOD_TO_KEY[period]][change]
    // A leg with no net delta is nonBalanceAffecting; any movement (rounded)
    // goes to balanceAffecting.
    if (tonnageDelta === 0) {
      group.nonBalanceAffecting.count += count
      pushRow(group.nonBalanceAffecting.rows, identity)
    } else {
      group.balanceAffecting.count += count
      group.balanceAffecting.tonnageDelta += tonnageDelta
      pushRow(group.balanceAffecting.rows, identity)
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
 * @param {Set<string>} params.submittedPeriods
 * @param {'monthly' | 'quarterly'} params.cadence
 * @param {ClassificationContext} params.context
 * @returns {PeriodStatusEntry[]}
 */
const classifyAdjustedWasteRecord = ({
  wasteRecord,
  existingRecordsMap,
  schema,
  submittedPeriods,
  cadence,
  context
}) => {
  const { record } = wasteRecord
  const { reportingDateFields } = schema

  const newPeriod = classifyPeriodStatus(
    record.data,
    reportingDateFields,
    submittedPeriods,
    cadence
  )
  const existingKey = `${record.type}:${record.rowId}`
  const existing = existingRecordsMap.get(existingKey)
  const oldPeriod = existing
    ? classifyPeriodStatus(
        existing.data,
        reportingDateFields,
        submittedPeriods,
        cadence
      )
    : null

  if (!newPeriod && !oldPeriod) {
    return []
  }

  // Reasons come from the current row, so both legs (including the old-period
  // reversal) reflect what the operator is uploading now.
  const { transactionAmount: newAmount, exclusionReasons } = classifyRow(
    schema,
    record.data,
    context
  )
  const oldAmount = existing
    ? classifyRow(schema, existing.data, context).transactionAmount
    : 0

  return classifyAdjustedRecord({
    oldPeriod,
    newPeriod,
    oldAmount,
    newAmount,
    identity: {
      rowId: String(record.rowId),
      wasteRecordType: schema.wasteRecordType,
      exclusionReasons
    }
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
  const submittedPeriods = buildSubmittedPeriods(periodicReports, cadence)

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
        submittedPeriods,
        cadence
      )
      if (period) {
        const { transactionAmount, exclusionReasons } = classifyRow(
          schema,
          record.data,
          classificationContext
        )
        entries.push(
          ...classifyAddedRecord({
            period,
            transactionAmount,
            identity: {
              rowId: String(record.rowId),
              wasteRecordType: schema.wasteRecordType,
              exclusionReasons
            }
          })
        )
      }
    } else {
      entries.push(
        ...classifyAdjustedWasteRecord({
          wasteRecord,
          existingRecordsMap,
          schema,
          submittedPeriods,
          cadence,
          context: classificationContext
        })
      )
    }
  }

  return reduceEntries(entries)
}
