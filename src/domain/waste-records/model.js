export const WASTE_RECORD_TYPE = Object.freeze({
  RECEIVED: 'received',
  PROCESSED: 'processed',
  SENT_ON: 'sentOn',
  EXPORTED: 'exported'
})

/**
 * @typedef {typeof WASTE_RECORD_TYPE[keyof typeof WASTE_RECORD_TYPE]} WasteRecordType
 */

/**
 * @typedef {Object} WasteRecord
 * @property {string} rowId - The waste record row identifier
 * @property {WasteRecordType} type
 * @property {Object} data - Reporting fields only
 * @property {import('#waste-records/repository/schema.js').RowStateLink} [link] - Where a linked row was filled in from (ADR-0060)
 */
