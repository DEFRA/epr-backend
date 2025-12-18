import { describe, it, expect } from 'vitest'
import { transformFromSummaryLog } from './transform-from-summary-log.js'
import {
  WASTE_RECORD_TYPE,
  VERSION_STATUS
} from '#domain/waste-records/model.js'

const SUMMARY_LOG_ID = 'summary-log-1'
const SUMMARY_LOG_URI = 's3://bucket/key'
const SUBMISSION_TIMESTAMP = '2025-01-15T14:30:00.000Z'
const FIRST_ROW_ID = 'row-123'
const FIRST_DATE = '2025-01-15'
const FIRST_WEIGHT = 100.5
const SECOND_WEIGHT = 200.75
const UPDATED_DATE = '2025-01-20'
const UPDATED_WEIGHT = 250.5

/**
 * Creates a validated row structure as expected by transformFromSummaryLog
 *
 * @param {string[]} headers - Column headers
 * @param {any[]} values - Row values matching headers
 * @param {string} rowId - Row identifier
 * @param {any[]} [issues] - Validation issues
 */
const createRow = (headers, values, rowId, issues = []) => {
  const data = {}
  for (let i = 0; i < headers.length; i++) {
    data[headers[i]] = values[i]
  }
  return { data, rowId, issues }
}

const RECEIVED_LOADS_HEADERS = [
  'ROW_ID',
  'DATE_RECEIVED_FOR_REPROCESSING',
  'GROSS_WEIGHT'
]

describe('transformFromSummaryLog', () => {
  it('transforms parsed RECEIVED_LOADS data into waste records', () => {
    const parsedData = {
      meta: {
        PROCESSING_TYPE: {
          value: 'REPROCESSOR_INPUT'
        }
      },
      data: {
        RECEIVED_LOADS_FOR_REPROCESSING: {
          location: { sheet: 'Sheet1', row: 1, column: 'A' },
          headers: RECEIVED_LOADS_HEADERS,
          rows: [
            createRow(
              RECEIVED_LOADS_HEADERS,
              [FIRST_ROW_ID, FIRST_DATE, FIRST_WEIGHT],
              FIRST_ROW_ID
            ),
            createRow(
              RECEIVED_LOADS_HEADERS,
              ['row-456', '2025-01-16', SECOND_WEIGHT],
              'row-456'
            )
          ]
        }
      }
    }

    const summaryLogContext = {
      summaryLog: {
        id: SUMMARY_LOG_ID,
        uri: SUMMARY_LOG_URI
      },
      organisationId: 'org-1',
      registrationId: 'reg-1',
      timestamp: SUBMISSION_TIMESTAMP
    }

    const result = transformFromSummaryLog(
      parsedData,
      summaryLogContext,
      new Map()
    )

    expect(result).toHaveLength(2)
    expectValidWasteRecord(result[0], FIRST_ROW_ID, FIRST_DATE, FIRST_WEIGHT)
    expectValidWasteRecord(result[1], 'row-456', '2025-01-16', SECOND_WEIGHT)
  })

  it('returns empty array when no RECEIVED_LOADS data present', () => {
    const parsedData = {
      meta: {
        PROCESSING_TYPE: {
          value: 'REPROCESSOR_INPUT'
        }
      },
      data: {}
    }

    const summaryLogContext = {
      summaryLog: {
        id: SUMMARY_LOG_ID,
        uri: SUMMARY_LOG_URI
      },
      organisationId: 'org-1',
      registrationId: 'reg-1',
      timestamp: SUBMISSION_TIMESTAMP
    }

    const result = transformFromSummaryLog(
      parsedData,
      summaryLogContext,
      new Map()
    )

    expect(result).toEqual([])
  })

  it('includes optional accreditationId when provided', () => {
    const headers = ['ROW_ID', 'DATE_RECEIVED_FOR_REPROCESSING']
    const parsedData = {
      meta: {
        PROCESSING_TYPE: {
          value: 'REPROCESSOR_INPUT'
        }
      },
      data: {
        RECEIVED_LOADS_FOR_REPROCESSING: {
          location: { sheet: 'Sheet1', row: 1, column: 'A' },
          headers,
          rows: [createRow(headers, [FIRST_ROW_ID, FIRST_DATE], FIRST_ROW_ID)]
        }
      }
    }

    const summaryLogContext = {
      summaryLog: {
        id: SUMMARY_LOG_ID,
        uri: SUMMARY_LOG_URI
      },
      organisationId: 'org-1',
      registrationId: 'reg-1',
      accreditationId: 'acc-1',
      timestamp: SUBMISSION_TIMESTAMP
    }

    const result = transformFromSummaryLog(
      parsedData,
      summaryLogContext,
      new Map()
    )

    expect(result[0].record.accreditationId).toBe('acc-1')
  })

  it('adds new version to existing waste record when rowId already exists', () => {
    const parsedData = {
      meta: {
        PROCESSING_TYPE: {
          value: 'REPROCESSOR_INPUT'
        }
      },
      data: {
        RECEIVED_LOADS_FOR_REPROCESSING: {
          location: { sheet: 'Sheet1', row: 1, column: 'A' },
          headers: RECEIVED_LOADS_HEADERS,
          rows: [
            createRow(
              RECEIVED_LOADS_HEADERS,
              [FIRST_ROW_ID, UPDATED_DATE, UPDATED_WEIGHT],
              FIRST_ROW_ID
            )
          ]
        }
      }
    }

    const summaryLogContext = {
      summaryLog: {
        id: 'summary-log-2',
        uri: 's3://bucket/key2'
      },
      organisationId: 'org-1',
      registrationId: 'reg-1',
      timestamp: SUBMISSION_TIMESTAMP
    }

    const existingWasteRecord = createExistingWasteRecord()
    const existingRecords = new Map([
      [`${WASTE_RECORD_TYPE.RECEIVED}:${FIRST_ROW_ID}`, existingWasteRecord]
    ])

    const result = transformFromSummaryLog(
      parsedData,
      summaryLogContext,
      existingRecords
    )

    expect(result).toHaveLength(1)
    const { record } = result[0]
    expect(record.versions).toHaveLength(2)
    expect(record.versions[0]).toMatchObject({
      status: VERSION_STATUS.CREATED,
      summaryLog: {
        id: SUMMARY_LOG_ID,
        uri: SUMMARY_LOG_URI
      }
    })
    expect(record.versions[1]).toMatchObject({
      status: VERSION_STATUS.UPDATED,
      summaryLog: {
        id: 'summary-log-2',
        uri: 's3://bucket/key2'
      },
      data: {
        DATE_RECEIVED_FOR_REPROCESSING: UPDATED_DATE,
        GROSS_WEIGHT: UPDATED_WEIGHT
      }
    })
    // Verify ROW_ID is not in the delta (it's an immutable identifier)
    expect(record.versions[1].data).not.toHaveProperty('ROW_ID')
    expect(record.versions[1].createdAt).toBe(SUBMISSION_TIMESTAMP)
  })

  it('returns existing record unchanged if no data has changed', () => {
    const parsedData = {
      meta: {
        PROCESSING_TYPE: {
          value: 'REPROCESSOR_INPUT'
        }
      },
      data: {
        RECEIVED_LOADS_FOR_REPROCESSING: {
          location: { sheet: 'Sheet1', row: 1, column: 'A' },
          headers: RECEIVED_LOADS_HEADERS,
          rows: [
            createRow(
              RECEIVED_LOADS_HEADERS,
              [FIRST_ROW_ID, FIRST_DATE, FIRST_WEIGHT],
              FIRST_ROW_ID
            )
          ]
        }
      }
    }

    const summaryLogContext = {
      summaryLog: {
        id: SUMMARY_LOG_ID,
        uri: SUMMARY_LOG_URI
      },
      organisationId: 'org-1',
      registrationId: 'reg-1',
      timestamp: SUBMISSION_TIMESTAMP
    }

    const existingWasteRecord = createExistingWasteRecord()
    const existingRecords = new Map([
      [`${WASTE_RECORD_TYPE.RECEIVED}:${FIRST_ROW_ID}`, existingWasteRecord]
    ])

    const result = transformFromSummaryLog(
      parsedData,
      summaryLogContext,
      existingRecords
    )

    expect(result).toHaveLength(1)
    expect(result[0].record).toBe(existingWasteRecord)
    expect(result[0].record.versions).toHaveLength(1)
  })

  it('throws error for unknown processing type', () => {
    const parsedData = {
      meta: {
        PROCESSING_TYPE: {
          value: 'UNKNOWN_TYPE'
        }
      },
      data: {}
    }

    const summaryLogContext = {
      summaryLog: {
        id: SUMMARY_LOG_ID,
        uri: SUMMARY_LOG_URI
      },
      organisationId: 'org-1',
      registrationId: 'reg-1',
      timestamp: SUBMISSION_TIMESTAMP
    }

    expect(() =>
      transformFromSummaryLog(parsedData, summaryLogContext, new Map())
    ).toThrow('Unknown PROCESSING_TYPE: UNKNOWN_TYPE')
  })

  it('returns empty array when no processing type is specified', () => {
    const parsedData = {
      meta: {},
      data: {
        RECEIVED_LOADS_FOR_REPROCESSING: {
          location: { sheet: 'Sheet1', row: 1, column: 'A' },
          headers: RECEIVED_LOADS_HEADERS,
          rows: [
            createRow(
              RECEIVED_LOADS_HEADERS,
              [FIRST_ROW_ID, FIRST_DATE, FIRST_WEIGHT],
              FIRST_ROW_ID
            )
          ]
        }
      }
    }

    const summaryLogContext = {
      summaryLog: {
        id: SUMMARY_LOG_ID,
        uri: SUMMARY_LOG_URI
      },
      organisationId: 'org-1',
      registrationId: 'reg-1',
      timestamp: SUBMISSION_TIMESTAMP
    }

    const result = transformFromSummaryLog(
      parsedData,
      summaryLogContext,
      new Map()
    )

    expect(result).toEqual([])
  })

  it('uses timestamp from context for all waste record versions', () => {
    const parsedData = {
      meta: {
        PROCESSING_TYPE: {
          value: 'REPROCESSOR_INPUT'
        }
      },
      data: {
        RECEIVED_LOADS_FOR_REPROCESSING: {
          location: { sheet: 'Sheet1', row: 1, column: 'A' },
          headers: RECEIVED_LOADS_HEADERS,
          rows: [
            createRow(
              RECEIVED_LOADS_HEADERS,
              [FIRST_ROW_ID, FIRST_DATE, FIRST_WEIGHT],
              FIRST_ROW_ID
            ),
            createRow(
              RECEIVED_LOADS_HEADERS,
              ['row-456', '2025-01-16', SECOND_WEIGHT],
              'row-456'
            ),
            createRow(
              RECEIVED_LOADS_HEADERS,
              ['row-789', '2025-01-17', 300],
              'row-789'
            )
          ]
        }
      }
    }

    const summaryLogContext = {
      summaryLog: {
        id: SUMMARY_LOG_ID,
        uri: SUMMARY_LOG_URI
      },
      organisationId: 'org-1',
      registrationId: 'reg-1',
      timestamp: SUBMISSION_TIMESTAMP
    }

    const result = transformFromSummaryLog(
      parsedData,
      summaryLogContext,
      new Map()
    )

    expect(result).toHaveLength(3)
    // All versions should have the exact same timestamp from context
    for (const { record } of result) {
      expect(record.versions[0].createdAt).toBe(SUBMISSION_TIMESTAMP)
    }
  })

  it('uses timestamp from context when updating existing records', () => {
    const parsedData = {
      meta: {
        PROCESSING_TYPE: {
          value: 'REPROCESSOR_INPUT'
        }
      },
      data: {
        RECEIVED_LOADS_FOR_REPROCESSING: {
          location: { sheet: 'Sheet1', row: 1, column: 'A' },
          headers: RECEIVED_LOADS_HEADERS,
          rows: [
            createRow(
              RECEIVED_LOADS_HEADERS,
              [FIRST_ROW_ID, UPDATED_DATE, UPDATED_WEIGHT],
              FIRST_ROW_ID
            )
          ]
        }
      }
    }

    const summaryLogContext = {
      summaryLog: {
        id: 'summary-log-2',
        uri: 's3://bucket/key2'
      },
      organisationId: 'org-1',
      registrationId: 'reg-1',
      timestamp: SUBMISSION_TIMESTAMP
    }

    const existingWasteRecord = createExistingWasteRecord()
    const existingRecords = new Map([
      [`${WASTE_RECORD_TYPE.RECEIVED}:${FIRST_ROW_ID}`, existingWasteRecord]
    ])

    const result = transformFromSummaryLog(
      parsedData,
      summaryLogContext,
      existingRecords
    )

    expect(result).toHaveLength(1)
    const { record } = result[0]
    // The new version (second one) should use the timestamp from context
    expect(record.versions[1].createdAt).toBe(SUBMISSION_TIMESTAMP)
  })
})

function createExistingWasteRecord() {
  return {
    organisationId: 'org-1',
    registrationId: 'reg-1',
    rowId: FIRST_ROW_ID,
    type: WASTE_RECORD_TYPE.RECEIVED,
    data: {
      ROW_ID: FIRST_ROW_ID,
      DATE_RECEIVED_FOR_REPROCESSING: FIRST_DATE,
      GROSS_WEIGHT: FIRST_WEIGHT
    },
    versions: [
      {
        createdAt: '2025-01-15T10:00:00.000Z',
        status: VERSION_STATUS.CREATED,
        summaryLog: {
          id: SUMMARY_LOG_ID,
          uri: SUMMARY_LOG_URI
        },
        data: {
          ROW_ID: FIRST_ROW_ID,
          DATE_RECEIVED_FOR_REPROCESSING: FIRST_DATE,
          GROSS_WEIGHT: FIRST_WEIGHT
        }
      }
    ]
  }
}

function expectValidWasteRecord(result, rowId, dateReceived, grossWeight) {
  const { record, issues } = result

  expect(issues).toEqual([])
  expect(record).toMatchObject({
    organisationId: 'org-1',
    registrationId: 'reg-1',
    rowId,
    type: WASTE_RECORD_TYPE.RECEIVED,
    data: {
      ROW_ID: rowId,
      DATE_RECEIVED_FOR_REPROCESSING: dateReceived,
      GROSS_WEIGHT: grossWeight
    }
  })

  expect(record.versions).toHaveLength(1)
  expect(record.versions[0]).toMatchObject({
    status: VERSION_STATUS.CREATED,
    summaryLog: {
      id: SUMMARY_LOG_ID,
      uri: SUMMARY_LOG_URI
    },
    data: {
      ROW_ID: rowId,
      DATE_RECEIVED_FOR_REPROCESSING: dateReceived,
      GROSS_WEIGHT: grossWeight
    }
  })
  expect(record.versions[0].createdAt).toBe(SUBMISSION_TIMESTAMP)
}
