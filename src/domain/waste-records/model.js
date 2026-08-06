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
 * A waste record is keyed by `(organisationId, registrationId, type, rowId)` —
 * `accreditationId` is not part of that key and is never persisted. It is set
 * only on a freshly transformed record for an accredited stream, and is absent
 * on a registered-only one and on every record read back from storage. It is
 * therefore optional rather than nullable: absent is reachable, `null` is not.
 * This is why the record does not name `RegistrationOrAccreditationId`, which
 * requires the key to be present.
 *
 * @typedef {Object} WasteRecord
 * @property {string} organisationId
 * @property {string} registrationId
 * @property {string} [accreditationId]
 * @property {string} rowId - The waste record row identifier
 * @property {WasteRecordType} type
 * @property {Object} data - Reporting fields only
 */
