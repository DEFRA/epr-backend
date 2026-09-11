import { addRounded, toNumber } from '#common/helpers/decimal-utils.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { WASTE_BALANCE_OUTCOME } from '#waste-balances/domain/waste-balance-classification.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import {
  WASTE_PROCESSING_TYPE,
  REPROCESSING_TYPE
} from '#domain/organisations/model.js'
import {
  RECEIVED_LOADS_FOR_REPROCESSING_FIELDS,
  SENT_ON_LOADS_FIELDS
} from '#domain/summary-logs/table-schemas/shared/fields.js'
import { REPROCESSED_LOADS_FIELDS } from '#domain/summary-logs/table-schemas/reprocessor-output/fields.js'
import { RECEIVED_LOADS_FIELDS as EXPORTER_RECEIVED_FIELDS } from '#domain/summary-logs/table-schemas/exporter/fields.js'
import {
  monthKeyForDate,
  YEAR_LENGTH
} from '#common/helpers/dates/year-month.js'

/**
 * The part of a waste record state the aggregation reads: what the row is, its
 * coerced data and the classification decided for it. Narrower than the full
 * `WasteRecordState` so a caller can aggregate anything of that shape, and so
 * the template a row reported under stays out of a calculation the
 * accreditation governs.
 *
 * @typedef {Pick<import('#waste-records/application/read-summary-log-row-states.js').WasteRecordState, 'wasteRecordType' | 'data' | 'classification'>} CreditableWasteRecordState
 */

/**
 * @typedef {import('#domain/organisations/model.js').WasteProcessingTypeValue} WasteProcessingTypeValue
 * @typedef {import('#domain/organisations/model.js').ReprocessingType} ReprocessingType
 * @typedef {import('#domain/summary-logs/meta-fields.js').ProcessingType} ProcessingType
 */

const YES = 'Yes'

/**
 * The accreditation context the aggregation needs — the domain accreditation's
 * own processing-type fields, so the service can pass its accreditation shape
 * straight through. A row records the template it reported under, but that says
 * which workbook it came from, not which table credits: the `sentOn`,
 * `received` and `processed` tables each appear in more than one template. Which
 * of them credits is a question about the accreditation, so the caller supplies
 * the accreditation's processing type and it decides which rows credit, which
 * deduct, and which contribute nothing.
 *
 * @typedef {Object} AccreditationContext
 * @property {WasteProcessingTypeValue} wasteProcessingType
 * @property {ReprocessingType} [reprocessingType]
 */

/**
 * An inclusive month range as `YYYY-MM` keys. The service supplies it (January
 * of the reporting year → the reporting month); the domain function reads the
 * clock nowhere.
 *
 * @typedef {Object} MonthRange
 * @property {string} fromMonth - inclusive start, `YYYY-MM`
 * @property {string} toMonth - inclusive end, `YYYY-MM`
 */

/**
 * One month's credited-tonnage figures for a single accreditation.
 *
 * @typedef {Object} MonthlyCreditedTonnage
 * @property {string} month - `YYYY-MM`
 * @property {number} totalCredited - gross tonnage on crediting rows, 2dp
 * @property {number} eligibleForWasteBalance - tonnage that credits the balance (INCLUDED classification), 2dp
 * @property {number} sentOnDeductions - sent-on tonnage, positive, reprocessor input only, 2dp
 */

/**
 * How many rows one population of unplaceable rows holds, and the tonnage on
 * them in the same two figures a month carries.
 *
 * Both are needed because they answer different questions and routinely
 * disagree. A row dated before the reporting window is usually dated before its
 * accreditation's `validFrom` as well, so the classifier ignores it: its
 * crediting column is non-zero while the waste balance holds nothing for it.
 * `totalCredited` alone would report such a row as recoverable tonnage when
 * there is none to recover.
 *
 * A deducting row raises `rowCount` only, so neither figure becomes a net
 * balance.
 *
 * @typedef {Object} SkippedRowTally
 * @property {number} rowCount
 * @property {number} totalCredited - gross tonnage on crediting rows, 2dp
 * @property {number} eligibleForWasteBalance - tonnage the balance holds for them (INCLUDED classification), 2dp
 */

/**
 * The rows no month could be found for, split by why. `noUsableDate` rows have
 * no reporting period at all; the other two are dated outside the range the
 * caller asked for, which are different populations: rows before the start are
 * the ones that might hold tonnage the report hides, and rows after the end are
 * future-dated.
 *
 * @typedef {Object} SkippedRows
 * @property {SkippedRowTally} noUsableDate
 * @property {SkippedRowTally} beforeWindowStart
 * @property {SkippedRowTally} afterWindowEnd
 */

/**
 * The aggregation result: one entry per month across the injected range
 * (ascending, zero-filled), plus the rows no month could be found for so the
 * caller can log them.
 *
 * @typedef {Object} CreditedTonnageByMonth
 * @property {MonthlyCreditedTonnage[]} months
 * @property {SkippedRows} skippedRows
 */

/**
 * How a row contributes: which tonnage column feeds the gross figure, which
 * date buckets it into a month, and whether it credits or deducts.
 *
 * @typedef {Object} RowContribution
 * @property {string} dateField
 * @property {number} tonnage
 * @property {boolean} credits
 */

/**
 * The granular template processing type for an accreditation. Exporters map to
 * `EXPORTER`; reprocessors split by their reprocessing type, defaulting to
 * input (the reprocessor default) when none is given.
 *
 * @param {AccreditationContext} accreditation
 * @returns {ProcessingType}
 */
export const processingTypeFor = ({
  wasteProcessingType,
  reprocessingType
}) => {
  if (wasteProcessingType === WASTE_PROCESSING_TYPE.EXPORTER) {
    return PROCESSING_TYPES.EXPORTER
  }
  if (reprocessingType === REPROCESSING_TYPE.OUTPUT) {
    return PROCESSING_TYPES.REPROCESSOR_OUTPUT
  }
  return PROCESSING_TYPES.REPROCESSOR_INPUT
}

/**
 * Expand an inclusive `YYYY-MM` range into its ordered list of month keys.
 *
 * @param {MonthRange} monthRange
 * @returns {string[]}
 */
const expandMonthRange = ({ fromMonth, toMonth }) => {
  const [fromYear, fromMonthNumber] = fromMonth.split('-').map(Number)
  const [toYear, toMonthNumber] = toMonth.split('-').map(Number)
  const months = []
  let year = fromYear
  let month = fromMonthNumber
  while (year < toYear || (year === toYear && month <= toMonthNumber)) {
    months.push(
      `${String(year).padStart(YEAR_LENGTH, '0')}-${String(month).padStart(2, '0')}`
    )
    month += 1
    if (month > 12) {
      month = 1
      year += 1
    }
  }
  return months
}

/**
 * The population a row the range has no bucket for belongs to.
 *
 * `expandMonthRange` builds a bucket for every month of the range, so a row
 * with a usable month and no bucket is dated outside it, and anything not
 * before the start is after the end.
 *
 * `YYYY-MM` keys are fixed-width, so ordering them is a string comparison.
 *
 * @param {string | null} month
 * @param {SkippedRows} skippedRows
 * @param {string} fromMonth
 * @returns {SkippedRowTally}
 */
const skippedPopulationFor = (month, skippedRows, fromMonth) => {
  if (month === null) {
    return skippedRows.noUsableDate
  }
  return month.localeCompare(fromMonth) < 0
    ? skippedRows.beforeWindowStart
    : skippedRows.afterWindowEnd
}

/**
 * Add a row the range has no bucket for to the population it belongs to,
 * carrying the same two tonnage figures the row would have added to a month.
 *
 * @param {SkippedRows} skippedRows
 * @param {string | null} month
 * @param {string} fromMonth
 * @param {CreditableWasteRecordState} rowState
 * @param {RowContribution} contribution
 * @returns {void}
 */
const tallySkippedRow = (
  skippedRows,
  month,
  fromMonth,
  rowState,
  contribution
) => {
  const tally = skippedPopulationFor(month, skippedRows, fromMonth)
  tally.rowCount += 1

  if (!contribution.credits) {
    return
  }

  tally.totalCredited = toNumber(
    addRounded(tally.totalCredited, contribution.tonnage, 2)
  )
  if (rowState.classification.outcome === WASTE_BALANCE_OUTCOME.INCLUDED) {
    tally.eligibleForWasteBalance = toNumber(
      addRounded(
        tally.eligibleForWasteBalance,
        rowState.classification.transactionAmount,
        2
      )
    )
  }
}

/**
 * Resolve a row state to its contribution for the accreditation's processing
 * type, or `null` when the row's table does not contribute under that type.
 *
 * The crediting table is fixed by the accreditation, not by the row alone: an
 * exporter credits its `exported` rows; a reprocessor-output accreditation
 * credits its `processed` rows (its `received` and `sentOn` rows are
 * supplementary); a reprocessor-input accreditation credits its `received` rows
 * and deducts its `sentOn` rows (its `processed` rows are supplementary). Every
 * other row type under each accreditation contributes nothing.
 *
 * @param {CreditableWasteRecordState} rowState
 * @param {ProcessingType} processingType
 * @returns {RowContribution | null}
 */
export const contributionFor = (rowState, processingType) => {
  const { wasteRecordType, data } = rowState

  if (processingType === PROCESSING_TYPES.EXPORTER) {
    if (wasteRecordType !== WASTE_RECORD_TYPE.EXPORTED) {
      return null
    }
    const interimSite =
      data[EXPORTER_RECEIVED_FIELDS.DID_WASTE_PASS_THROUGH_AN_INTERIM_SITE] ===
      YES
    return {
      dateField: EXPORTER_RECEIVED_FIELDS.DATE_RECEIVED_BY_OSR,
      tonnage: interimSite
        ? data[
            EXPORTER_RECEIVED_FIELDS.TONNAGE_PASSED_INTERIM_SITE_RECEIVED_BY_OSR
          ]
        : data[EXPORTER_RECEIVED_FIELDS.TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED],
      credits: true
    }
  }

  if (processingType === PROCESSING_TYPES.REPROCESSOR_OUTPUT) {
    if (wasteRecordType !== WASTE_RECORD_TYPE.PROCESSED) {
      return null
    }
    return {
      dateField: REPROCESSED_LOADS_FIELDS.DATE_LOAD_LEFT_SITE,
      tonnage:
        data[REPROCESSED_LOADS_FIELDS.PRODUCT_UK_PACKAGING_WEIGHT_PROPORTION],
      credits: true
    }
  }

  // Reprocessor input: received loads credit, sent-on loads deduct; the
  // supplementary processed table does not contribute.
  if (wasteRecordType === WASTE_RECORD_TYPE.RECEIVED) {
    return {
      dateField:
        RECEIVED_LOADS_FOR_REPROCESSING_FIELDS.DATE_RECEIVED_FOR_REPROCESSING,
      tonnage:
        data[
          RECEIVED_LOADS_FOR_REPROCESSING_FIELDS.TONNAGE_RECEIVED_FOR_RECYCLING
        ],
      credits: true
    }
  }
  if (wasteRecordType === WASTE_RECORD_TYPE.SENT_ON) {
    return {
      dateField: SENT_ON_LOADS_FIELDS.DATE_LOAD_LEFT_SITE,
      tonnage: data[SENT_ON_LOADS_FIELDS.TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON],
      credits: false
    }
  }
  return null
}

/**
 * Aggregate one accreditation's row states into per-month credited-tonnage
 * figures.
 *
 * Each contributing row lands in at most one month, bucketed by its
 * month-assignment date. Crediting rows add their tonnage column to
 * `totalCredited` gross — every row regardless of classification — and add
 * `classification.transactionAmount` to `eligibleForWasteBalance` when the
 * row's outcome is `INCLUDED`. Sent-on rows on a
 * reprocessor-input accreditation add their tonnage to `sentOnDeductions`
 * as a positive number. Rows whose month-assignment date is missing,
 * unparseable, or outside the range are dropped and tallied in `skippedRows`,
 * separately per population. Sums are decimal-safe to 2dp.
 *
 * @param {CreditableWasteRecordState[]} rowStates
 * @param {AccreditationContext} accreditation
 * @param {MonthRange} monthRange
 * @returns {CreditedTonnageByMonth}
 */
export const creditedTonnageByMonth = (
  rowStates,
  accreditation,
  monthRange
) => {
  const processingType = processingTypeFor(accreditation)
  const orderedMonths = expandMonthRange(monthRange)
  const buckets = new Map(
    orderedMonths.map((month) => [
      month,
      {
        totalCredited: 0,
        eligibleForWasteBalance: 0,
        sentOnDeductions: 0
      }
    ])
  )

  /** @type {SkippedRows} */
  const skippedRows = {
    noUsableDate: { rowCount: 0, totalCredited: 0, eligibleForWasteBalance: 0 },
    beforeWindowStart: {
      rowCount: 0,
      totalCredited: 0,
      eligibleForWasteBalance: 0
    },
    afterWindowEnd: {
      rowCount: 0,
      totalCredited: 0,
      eligibleForWasteBalance: 0
    }
  }

  for (const rowState of rowStates) {
    const contribution = contributionFor(rowState, processingType)
    if (contribution === null) {
      continue
    }

    const month = monthKeyForDate(rowState.data[contribution.dateField])
    const bucket = month === null ? undefined : buckets.get(month)
    if (bucket === undefined) {
      tallySkippedRow(
        skippedRows,
        month,
        monthRange.fromMonth,
        rowState,
        contribution
      )
      continue
    }

    if (contribution.credits) {
      bucket.totalCredited = toNumber(
        addRounded(bucket.totalCredited, contribution.tonnage, 2)
      )
      if (rowState.classification.outcome === WASTE_BALANCE_OUTCOME.INCLUDED) {
        bucket.eligibleForWasteBalance = toNumber(
          addRounded(
            bucket.eligibleForWasteBalance,
            rowState.classification.transactionAmount,
            2
          )
        )
      }
    } else {
      bucket.sentOnDeductions = toNumber(
        addRounded(bucket.sentOnDeductions, contribution.tonnage, 2)
      )
    }
  }

  const months = orderedMonths.map((month) => {
    const bucket = /** @type {NonNullable<ReturnType<typeof buckets.get>>} */ (
      buckets.get(month)
    )
    return { month, ...bucket }
  })

  return { months, skippedRows }
}
