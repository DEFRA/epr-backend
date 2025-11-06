import {
  WASTE_RECORD_TYPE,
  VERSION_STATUS
} from '#domain/waste-records/model.js'

let rowIdCounter = 0

/**
 * Build a minimal waste record for testing
 * @param {Object} [overrides]
 * @returns {import('#domain/waste-records/model.js').WasteRecord}
 */
export const buildWasteRecord = (overrides = {}) => {
  const rowId = overrides.rowId || `row-${++rowIdCounter}`
  const organisationId = overrides.organisationId || 'org-1'
  const registrationId = overrides.registrationId || 'reg-1'
  const type = overrides.type || WASTE_RECORD_TYPE.RECEIVED
  const data = overrides.data || {
    ROW_ID: rowId,
    DATE_RECEIVED_FOR_REPROCESSING: '2025-01-15',
    GROSS_WEIGHT: 100.5
  }

  const version = {
    createdAt: new Date('2025-01-15T10:00:00.000Z').toISOString(),
    status: VERSION_STATUS.CREATED,
    summaryLog: {
      id: 'summary-log-1',
      uri: 's3://bucket/key'
    },
    data
  }

  const record = {
    organisationId,
    registrationId,
    rowId,
    type,
    data,
    versions: [version],
    ...overrides
  }

  // Don't include accreditationId unless explicitly provided
  if (overrides.accreditationId) {
    record.accreditationId = overrides.accreditationId
  }

  return record
}
