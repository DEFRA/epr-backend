import { coerceStoredTonnages } from '#waste-records/application/stored-tonnage-coercion.js'

/**
 * @import { ReportableWasteRecordState } from './aggregate-report-detail.js'
 */

/**
 * Present raw report fixtures as the row states the aggregation actually reads.
 *
 * The aggregation reads the summary-log row-state collection, whose tonnages
 * are held to two decimal places because the write path coerces them on the
 * way in. These fixtures carry the full-precision figures from the source
 * spreadsheets, so this coerces each record's data the same way the write path
 * does, giving the aggregation the two-decimal-place values it reads in
 * production.
 *
 * @param {unknown} records
 * @returns {ReportableWasteRecordState[]}
 */
export const asStoredRowStates = (records) =>
  /** @type {ReportableWasteRecordState[]} */ (
    /** @type {{ data: Record<string, any> }[]} */ (records).map((record) => ({
      ...record,
      data: coerceStoredTonnages(record.data)
    }))
  )
