import { describe, it, expect } from 'vitest'
import { transformFromSummaryLog } from './transform-from-summary-log.js'
import {
  WASTE_RECORD_TYPE,
  VERSION_STATUS
} from '#domain/waste-records/model.js'

const SUMMARY_LOG_ID = 'summary-log-1'
const SUMMARY_LOG_URI = 's3://bucket/key'
const FIRST_ROW_ID = 'row-123'
const FIRST_DATE = '2025-01-15'
const FIRST_WEIGHT = 100.5
const SECOND_WEIGHT = 200.75
const UPDATED_DATE = '2025-01-20'
const UPDATED_WEIGHT = 250.5

describe('transformFromSummaryLog', () => {
  it('transforms parsed RECEIVED_LOADS data into waste records', async () => {
    const parsedData = {
      meta: {
        PROCESSING_TYPE: {
          value: 'REPROCESSOR_INPUT'
        }
      },
      data: {
        RECEIVED_LOADS_FOR_REPROCESSING: {
          location: { sheet: 'Sheet1', row: 1, column: 'A' },
          headers: ['ROW_ID', 'DATE_RECEIVED_FOR_REPROCESSING', 'GROSS_WEIGHT'],
          rows: [
            [FIRST_ROW_ID, FIRST_DATE, FIRST_WEIGHT],
            ['row-456', '2025-01-16', SECOND_WEIGHT]
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
      registrationId: 'reg-1'
    }

    const result = await transformFromSummaryLog(parsedData, summaryLogContext)

    expect(result).toHaveLength(2)
    expectValidWasteRecord(result[0], FIRST_ROW_ID, FIRST_DATE, FIRST_WEIGHT)
    expectValidWasteRecord(result[1], 'row-456', '2025-01-16', SECOND_WEIGHT)
  })

  it('returns empty array when no RECEIVED_LOADS data present', async () => {
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
      registrationId: 'reg-1'
    }

    const result = await transformFromSummaryLog(parsedData, summaryLogContext)

    expect(result).toEqual([])
  })

  it('includes optional accreditationId when provided', async () => {
    const parsedData = {
      meta: {
        PROCESSING_TYPE: {
          value: 'REPROCESSOR_INPUT'
        }
      },
      data: {
        RECEIVED_LOADS_FOR_REPROCESSING: {
          location: { sheet: 'Sheet1', row: 1, column: 'A' },
          headers: ['ROW_ID', 'DATE_RECEIVED_FOR_REPROCESSING'],
          rows: [[FIRST_ROW_ID, FIRST_DATE]]
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
      accreditationId: 'acc-1'
    }

    const result = await transformFromSummaryLog(parsedData, summaryLogContext)

    expect(result[0].accreditationId).toBe('acc-1')
  })

  it('adds new version to existing waste record when rowId already exists', async () => {
    const parsedData = {
      meta: {
        PROCESSING_TYPE: {
          value: 'REPROCESSOR_INPUT'
        }
      },
      data: {
        RECEIVED_LOADS_FOR_REPROCESSING: {
          location: { sheet: 'Sheet1', row: 1, column: 'A' },
          headers: ['ROW_ID', 'DATE_RECEIVED_FOR_REPROCESSING', 'GROSS_WEIGHT'],
          rows: [[FIRST_ROW_ID, UPDATED_DATE, UPDATED_WEIGHT]]
        }
      }
    }

    const summaryLogContext = {
      summaryLog: {
        id: 'summary-log-2',
        uri: 's3://bucket/key2'
      },
      organisationId: 'org-1',
      registrationId: 'reg-1'
    }

    const existingWasteRecord = createExistingWasteRecord()
    const findExistingRecord = createFindExistingRecordStub(existingWasteRecord)

    const result = await transformFromSummaryLog(
      parsedData,
      summaryLogContext,
      findExistingRecord
    )

    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('existing-id')
    expect(result[0].versions).toHaveLength(2)
    expect(result[0].versions[0]).toMatchObject({
      id: 'version-1',
      status: VERSION_STATUS.CREATED,
      summaryLog: {
        id: SUMMARY_LOG_ID,
        uri: SUMMARY_LOG_URI
      }
    })
    expect(result[0].versions[1]).toMatchObject({
      status: VERSION_STATUS.UPDATED,
      summaryLog: {
        id: 'summary-log-2',
        uri: 's3://bucket/key2'
      },
      data: {
        ROW_ID: FIRST_ROW_ID,
        DATE_RECEIVED_FOR_REPROCESSING: UPDATED_DATE,
        GROSS_WEIGHT: UPDATED_WEIGHT
      }
    })
    expect(result[0].versions[1].id).toBeTruthy()
    expect(result[0].versions[1].createdAt).toBeTruthy()
  })

  it('throws error for unknown processing type', async () => {
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
      registrationId: 'reg-1'
    }

    await expect(
      transformFromSummaryLog(parsedData, summaryLogContext)
    ).rejects.toThrow('Unknown PROCESSING_TYPE: UNKNOWN_TYPE')
  })

  it('returns empty array when no processing type is specified', async () => {
    const parsedData = {
      meta: {},
      data: {
        RECEIVED_LOADS_FOR_REPROCESSING: {
          location: { sheet: 'Sheet1', row: 1, column: 'A' },
          headers: ['ROW_ID', 'DATE_RECEIVED_FOR_REPROCESSING', 'GROSS_WEIGHT'],
          rows: [[FIRST_ROW_ID, FIRST_DATE, FIRST_WEIGHT]]
        }
      }
    }

    const summaryLogContext = {
      summaryLog: {
        id: SUMMARY_LOG_ID,
        uri: SUMMARY_LOG_URI
      },
      organisationId: 'org-1',
      registrationId: 'reg-1'
    }

    const result = await transformFromSummaryLog(parsedData, summaryLogContext)

    expect(result).toEqual([])
  })
})

function createExistingWasteRecord() {
  return {
    id: 'existing-id',
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
        id: 'version-1',
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

function createFindExistingRecordStub(existingRecord) {
  return async (organisationId, registrationId, type, rowId) => {
    if (
      organisationId === 'org-1' &&
      registrationId === 'reg-1' &&
      type === WASTE_RECORD_TYPE.RECEIVED &&
      rowId === FIRST_ROW_ID
    ) {
      return existingRecord
    }
    return null
  }
}

function expectValidWasteRecord(record, rowId, dateReceived, grossWeight) {
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

  expect(record.id).toBeTruthy()
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
  expect(record.versions[0].id).toBeTruthy()
  expect(record.versions[0].createdAt).toBeTruthy()
}
