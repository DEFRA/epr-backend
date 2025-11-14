import { randomUUID } from 'node:crypto'
import {
  WASTE_RECORD_TYPE,
  VERSION_STATUS
} from '#domain/waste-records/model.js'

let rowIdCounter = 0

const generateRowId = () => {
  rowIdCounter++
  return `row-${randomUUID()}-${rowIdCounter}`
}

/**
 * Build version data for appendVersions
 * @param {object} [options] - Optional overrides
 * @param {string} [options.summaryLogId] - Summary log ID for this version
 * @param {string} [options.summaryLogUri] - Summary log URI
 * @param {string} [options.createdAt] - ISO timestamp
 * @param {string} [options.status] - Version status (CREATED, UPDATED)
 * @param {object} [options.versionData] - Data for version (delta or full)
 * @param {object} [options.currentData] - Current data state
 * @returns {{version: object, data: object}}
 */
export const buildVersionData = (options = {}) => {
  const summaryLogId = options.summaryLogId || 'summary-log-1'
  const summaryLogUri = options.summaryLogUri || 's3://bucket/key'
  const createdAt =
    options.createdAt || new Date('2025-01-15T10:00:00.000Z').toISOString()
  const status = options.status || VERSION_STATUS.CREATED
  const versionData = options.versionData || {
    DATE_RECEIVED_FOR_REPROCESSING: '2025-01-15',
    GROSS_WEIGHT: 100.5
  }
  const currentData = options.currentData || versionData

  return {
    version: {
      createdAt,
      status,
      summaryLog: {
        id: summaryLogId,
        uri: summaryLogUri
      },
      data: versionData
    },
    data: currentData
  }
}

/**
 * Convert object representation to nested Map structure for appendVersions
 * @param {Object.<string, Object.<string, {version: object, data: object}>>} versionsByTypeObj
 * @returns {Map<string, Map<string, {version: object, data: object}>>}
 */
export const toVersionsByType = (versionsByTypeObj) => {
  const versionsByType = new Map()
  for (const [type, recordsObj] of Object.entries(versionsByTypeObj)) {
    const recordsMap = new Map(Object.entries(recordsObj))
    versionsByType.set(type, recordsMap)
  }
  return versionsByType
}

/**
 * Build a minimal waste record for testing (legacy format for tests that need full WasteRecord)
 * @param {Partial<import('#domain/waste-records/model.js').WasteRecord>} [overrides] - Optional overrides for the waste record
 * @returns {import('#domain/waste-records/model.js').WasteRecord}
 */
export const buildWasteRecord = (overrides = {}) => {
  const rowId = overrides.rowId || generateRowId()
  const organisationId = overrides.organisationId || 'org-1'
  const registrationId = overrides.registrationId || 'reg-1'
  const type = overrides.type || WASTE_RECORD_TYPE.RECEIVED
  const data = overrides.data || {
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

  return {
    organisationId,
    registrationId,
    rowId,
    type,
    data,
    versions: [version],
    ...overrides
  }
}
