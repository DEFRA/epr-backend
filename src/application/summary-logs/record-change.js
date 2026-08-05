/**
 * How a waste record changed in the current summary-log upload, in the
 * user-facing reporting vocabulary. Derived by comparing the upload's row
 * against the latest submitted summary log's row state: a row not present in
 * that state reads as added, a row whose content or reading differs as adjusted,
 * and a row that matches it exactly as unchanged.
 */
export const RECORD_CHANGE = Object.freeze({
  ADDED: 'added',
  ADJUSTED: 'adjusted',
  UNCHANGED: 'unchanged'
})

/** @typedef {typeof RECORD_CHANGE[keyof typeof RECORD_CHANGE]} RecordChange */

/**
 * The change classified for a record. Every waste record classified in this
 * upload has an entry keyed `${type}:${rowId}`, so the lookup is total; a miss
 * is an invariant violation, not a reachable state.
 *
 * @param {Map<string, RecordChange>} recordChanges
 * @param {{ type: string, rowId: string | number }} record
 * @returns {RecordChange}
 */
export const recordChangeFor = (recordChanges, record) => {
  const change = recordChanges.get(`${record.type}:${record.rowId}`)
  /* v8 ignore next 3 -- every classified record has a change */
  if (!change) {
    throw new Error(`No record change for ${record.type}:${record.rowId}`)
  }
  return change
}
