import { VERSION_STATUS } from '#domain/waste-records/model.js'

/** @import {ValidatedWasteRecord} from '#application/waste-records/transform-from-summary-log.js' */

/**
 * How a waste record changed in the current summary-log upload, in the
 * user-facing reporting vocabulary. Derived from the record's latest version:
 * a version CREATED in this upload reads as added, an UPDATED one as adjusted,
 * and a record with no version from this upload as unchanged.
 */
export const RECORD_CHANGE = Object.freeze({
  ADDED: 'added',
  ADJUSTED: 'adjusted',
  UNCHANGED: 'unchanged'
})

/** @typedef {typeof RECORD_CHANGE[keyof typeof RECORD_CHANGE]} RecordChange */

/**
 * Classifies how a record changed in this upload from its latest version.
 *
 * @param {ValidatedWasteRecord['record']} record
 * @param {string} summaryLogId
 * @returns {RecordChange}
 */
export const determineRecordStatus = (record, summaryLogId) => {
  const lastVersion = record.versions.at(-1)
  if (lastVersion?.summaryLog?.id !== summaryLogId) {
    return RECORD_CHANGE.UNCHANGED
  }
  return lastVersion.status === VERSION_STATUS.CREATED
    ? RECORD_CHANGE.ADDED
    : RECORD_CHANGE.ADJUSTED
}
