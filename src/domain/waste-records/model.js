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
 * @typedef {Object} WasteRecordVersion
 * @property {string} id
 * @property {string} createdAt - ISO8601 timestamp
 * @property {VersionStatus} status
 * @property {string} summaryLogId - Foreign key to summary log that created this version
 * @property {string} summaryLogUri - S3 object URI to avoid extra query
 * @property {Object} data - For 'created' status: all fields required for reporting. For 'updated'/'pending': only changed fields
 */

/**
 * @typedef {Object} WasteRecord
 * @property {string} id
 * @property {string} organisationId
 * @property {string} registrationId
 * @property {string} [accreditationId]
 * @property {string} rowId - The waste record row identifier
 * @property {WasteRecordType} type
 * @property {Object} data - Reporting fields only
 * @property {WasteRecordVersion[]} versions - Version history. createdAt/updatedAt derived from first/last version
 */
