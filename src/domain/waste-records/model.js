/**
 * @typedef {Object} WasteRecordVersion
 * @property {string} id
 * @property {string} createdAt - ISO8601 timestamp
 * @property {import('./version-status.js').VersionStatus} status
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
 * @property {import('./type.js').WasteRecordType} type
 * @property {Object} data - Reporting fields only
 * @property {WasteRecordVersion[]} versions - Version history. createdAt/updatedAt derived from first/last version
 */
