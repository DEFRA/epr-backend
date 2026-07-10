import { roundToTwoDecimalPlaces } from '#common/helpers/decimal-utils.js'
import { getTargetAmount } from '#waste-balances/application/target-amount.js'
import { MAX_ROWS_PER_BUCKET } from '#domain/summary-logs/loads-by-period-status-schema.js'
import { ROW_OUTCOME } from '#domain/summary-logs/table-schemas/validation-pipeline.js'
import { periodForDate } from '#reports/domain/period-for-date.js'
import { periodKey } from '#reports/domain/period-key.js'
import {
  buildSubmittedPeriods,
  isDateInSubmittedPeriod
} from '#reports/domain/submitted-periods.js'
import { RECORD_CHANGE, recordChangeFor } from './record-change.js'

/** Internal reporting-period status. Not serialised: mapped to output keys via PERIOD_TO_KEY. */
const PERIOD_STATUS = Object.freeze({ OPEN: 'open', CLOSED: 'closed' })

/** @typedef {typeof PERIOD_STATUS[keyof typeof PERIOD_STATUS]} PeriodStatus */

/** @import {ValidatedWasteRecord} from '#application/waste-records/transform-from-summary-log.js' */
/** @import {PeriodicReport} from '#reports/repository/port.js' */
/** @import {WasteRecordState} from '#waste-records/application/read-summary-log-row-states.js' */
/** @import {OverseasSitesContext} from '#domain/summary-logs/table-schemas/validation-pipeline.js' */
/** @import {TableSchema} from '#domain/summary-logs/table-schemas/index.js' */
/** @import {PROCESSING_TYPE_TABLES} from '#domain/summary-logs/table-schemas/index.js' */
/** @import {Accreditation} from '#domain/organisations/accreditation.js' */
/** @import {PeriodRef} from '#reports/domain/period-key.js' */
/** @import {Cadence} from '#reports/domain/cadence.js' */
/** @import {RecordChange} from './record-change.js' */

/** @typedef {typeof PROCESSING_TYPE_TABLES[keyof typeof PROCESSING_TYPE_TABLES]} ProcessingTypeSchemas */

/**
 * A load's stable identity and exclusion reason codes, computed once and
 * carried onto every leg it produces. exclusionReasons is empty for an
 * included row.
 * @typedef {{ rowId: string, wasteRecordType: string, exclusionReasons: string[] }} RowIdentity
 */

/**
 * A single load listed under an expandable bucket: its identity plus the
 * signed tonnage this leg contributed to the period's balance (0 for a
 * non-balance-affecting row). For a cross-period amendment each period's row
 * carries that leg's delta, not the global net.
 * @typedef {RowIdentity & { tonnageDelta: number }} RowDetail
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
 * @typedef {{ openPeriodLoads: PeriodStatusByRecordChange, closedPeriodLoads: PeriodStatusByRecordChange, closedPeriods: PeriodRef[] }} LoadsByReportingPeriod
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
 * @property {PeriodStatus} period
 * @property {RecordChange} change
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
  closedPeriodLoads: emptyChange(),
  closedPeriods: []
})

/**
 * Whether a reporting date falls in a submitted (closed) period. A missing
 * date is never in a closed period.
 *
 * @param {string | Date | null | undefined} date
 * @param {Set<string>} submittedPeriods
 * @param {Cadence} cadence
 * @returns {date is string | Date}
 */
const isSubmittedDate = (date, submittedPeriods, cadence) =>
  date ? isDateInSubmittedPeriod(submittedPeriods, date, cadence) : false

/**
 * Applies the closed-wins rule: if ANY date field falls in a submitted
 * (closed) period, the record is classified as closed.
 * Returns null if no date fields have a value.
 *
 * @param {Record<string, string | Date | null | undefined>} data
 * @param {string[]} reportingDateFields
 * @param {Set<string>} submittedPeriods
 * @param {Cadence} cadence
 * @returns {PeriodStatus | null}
 */
const classifyPeriodStatus = (
  data,
  reportingDateFields,
  submittedPeriods,
  cadence
) => {
  const dates = reportingDateFields.map((field) => data[field])

  if (dates.some((date) => isSubmittedDate(date, submittedPeriods, cadence))) {
    return PERIOD_STATUS.CLOSED
  }

  return dates.some(Boolean) ? PERIOD_STATUS.OPEN : null
}

/**
 * The closed (submitted) periods a record's dates fall in. Mirrors
 * {@link classifyPeriodStatus} but yields the period identities rather than a
 * single open/closed verdict, so resubmission detection knows which submitted
 * periods this change touched.
 *
 * @param {Record<string, string | Date | null | undefined>} data
 * @param {string[]} reportingDateFields
 * @param {Set<string>} submittedPeriods
 * @param {Cadence} cadence
 * @returns {PeriodRef[]}
 */
const closedPeriodRefsFor = (
  data,
  reportingDateFields,
  submittedPeriods,
  cadence
) =>
  reportingDateFields.flatMap((field) => {
    const dateValue = data[field]

    if (!isSubmittedDate(dateValue, submittedPeriods, cadence)) {
      return []
    }

    const { year, period } = periodForDate(dateValue, cadence)
    return [{ year, cadence, period }]
  })

/**
 * The closed (submitted) periods a single added/adjusted record touches. An
 * adjustment also touches the period the load is moving out of, so the existing
 * record's dates are included alongside the new ones.
 *
 * @param {ValidatedWasteRecord['record']} record
 * @param {RecordChange} status
 * @param {TableSchema} schema
 * @param {Map<string, WasteRecordState>} submittedRowStatesByKey
 * @param {Set<string>} submittedPeriods
 * @param {Cadence} cadence
 * @returns {PeriodRef[]}
 */
const closedPeriodRefsForRecord = (
  record,
  status,
  schema,
  submittedRowStatesByKey,
  submittedPeriods,
  cadence
) => {
  const changedData =
    status === RECORD_CHANGE.ADDED
      ? [record.data]
      : [
          record.data,
          submittedRowStatesByKey.get(`${record.type}:${record.rowId}`)?.data
        ]

  return changedData
    .filter(Boolean)
    .flatMap((data) =>
      closedPeriodRefsFor(
        data,
        schema.reportingDateFields,
        submittedPeriods,
        cadence
      )
    )
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
 * @param {PeriodStatus} params.period
 * @param {number} params.transactionAmount
 * @param {RowIdentity} params.identity
 * @returns {PeriodStatusEntry[]}
 */
const classifyAddedRecord = ({ period, transactionAmount, identity }) => [
  {
    period,
    change: RECORD_CHANGE.ADDED,
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
 * @param {PeriodStatus | null} params.oldPeriod
 * @param {PeriodStatus | null} params.newPeriod
 * @param {number} params.oldAmount
 * @param {number} params.newAmount
 * @param {RowIdentity} params.identity
 * @returns {PeriodStatusEntry[]}
 */
const classifyAdjustedRecord = ({
  oldPeriod,
  newPeriod,
  oldAmount,
  newAmount,
  identity
}) => {
  /** @type {Map<PeriodStatus, number>} */
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
    change: RECORD_CHANGE.ADJUSTED,
    count: 1,
    tonnageDelta: roundToTwoDecimalPlaces(tonnageDelta),
    ...identity
  }))
}

/**
 * Maps a record's internal period status to its output bucket key.
 * @type {Record<PeriodStatus, 'openPeriodLoads' | 'closedPeriodLoads'>}
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
    const row = { ...identity, tonnageDelta }
    if (tonnageDelta === 0) {
      group.nonBalanceAffecting.count += count
      pushRow(group.nonBalanceAffecting.rows, row)
    } else {
      group.balanceAffecting.count += count
      group.balanceAffecting.tonnageDelta += tonnageDelta
      pushRow(group.balanceAffecting.rows, row)
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
 * @param {Map<string, WasteRecordState>} params.submittedRowStatesByKey
 * @param {TableSchema} params.schema
 * @param {Set<string>} params.submittedPeriods
 * @param {Cadence} params.cadence
 * @param {ClassificationContext} params.context
 * @returns {PeriodStatusEntry[]}
 */
const classifyAdjustedWasteRecord = ({
  wasteRecord,
  submittedRowStatesByKey,
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
  const existing = submittedRowStatesByKey.get(existingKey)
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
  // The old contribution is the amount stamped on the submitted row state — the
  // figure already applied to the waste balance — not a re-derivation from its
  // stored data, whose projection drops fields the classifier reads.
  const oldAmount = existing ? getTargetAmount(existing.classification) : 0

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
 * @param {Map<string, WasteRecordState>} params.submittedRowStatesByKey
 * @param {Map<string, RecordChange>} params.recordChanges
 * @param {PeriodicReport[]} params.periodicReports
 * @param {Cadence} params.cadence
 * @param {ProcessingTypeSchemas} params.tableSchemas
 * @param {ClassificationContext} params.classificationContext
 * @returns {LoadsByReportingPeriod}
 */
export const classifyByPeriodStatus = ({
  wasteRecords,
  submittedRowStatesByKey,
  recordChanges,
  periodicReports,
  cadence,
  tableSchemas,
  classificationContext
}) => {
  const submittedPeriods = buildSubmittedPeriods(periodicReports, cadence)

  /** @type {PeriodStatusEntry[]} */
  const entries = []

  /** @type {Map<string, PeriodRef>} */
  const closedPeriodsByKey = new Map()

  for (const wasteRecord of wasteRecords) {
    const { record, outcome } = wasteRecord
    const status = recordChangeFor(recordChanges, record)
    const schema = tableSchemas[wasteRecord.tableName]

    if (
      outcome === ROW_OUTCOME.IGNORED ||
      status === RECORD_CHANGE.UNCHANGED ||
      !schema
    ) {
      continue
    }

    closedPeriodRefsForRecord(
      record,
      status,
      schema,
      submittedRowStatesByKey,
      submittedPeriods,
      cadence
    ).forEach((ref) => closedPeriodsByKey.set(periodKey(ref), ref))

    if (status === RECORD_CHANGE.ADDED) {
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
          submittedRowStatesByKey,
          schema,
          submittedPeriods,
          cadence,
          context: classificationContext
        })
      )
    }
  }

  return {
    ...reduceEntries(entries),
    closedPeriods: [...closedPeriodsByKey.values()]
  }
}
