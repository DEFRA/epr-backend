export const WASTE_RECORD_TYPE = Object.freeze({
  RECEIVED: 'received',
  PROCESSED: 'processed',
  SENT_ON: 'sentOn',
  EXPORTED: 'exported'
})

/**
 * @typedef {typeof WASTE_RECORD_TYPE[keyof typeof WASTE_RECORD_TYPE]} WasteRecordType
 */

export const VERSION_STATUS = Object.freeze({
  CREATED: 'created',
  UPDATED: 'updated',
  PENDING: 'pending'
})

/**
 * @typedef {typeof VERSION_STATUS[keyof typeof VERSION_STATUS]} VersionStatus
 */

/**
 * @typedef {Object} SummaryLogReference
 * @property {string} id - Summary log ID
 * @property {string} uri - S3 object URI
 */

/**
 * @typedef {Object} WasteRecordVersion
 * @property {string} id - Version ID
 * @property {string} createdAt - ISO8601 timestamp
 * @property {VersionStatus} status
 * @property {SummaryLogReference} summaryLog - Reference to summary log that created this version
 * @property {Object} data - For 'created' status: all fields required for reporting. For 'updated'/'pending': only changed fields
 */

/**
 * @typedef {Object} WasteRecord
 * @property {string} organisationId
 * @property {string} registrationId
 * @property {string} [accreditationId]
 * @property {string} rowId - The waste record row identifier
 * @property {WasteRecordType} type
 * @property {Object} data - Reporting fields only
 * @property {WasteRecordVersion[]} versions - Version history. createdAt/updatedAt derived from first/last version
 * @property {import('#domain/waste-balances/model.js').UserSummary} [updatedBy] - User who last updated the record
 * @property {boolean} [excludedFromWasteBalance] - Set by markExcludedRecords when the row fails schema validation
 */
