import { describe, it, expect } from 'vitest'
import { transformFromSummaryLog } from './transform-from-summary-log.js'
import {
  WASTE_RECORD_TYPE,
  VERSION_STATUS
} from '#domain/waste-records/model.js'

const SUMMARY_LOG_ID = 'summary-log-1'
const SUMMARY_LOG_URI = 's3://bucket/key'
const DATE_RECEIVED = 'DATE_RECEIVED'
const FIRST_ROW_ID = 'row-123'
const FIRST_DATE = '2025-01-15'
const FIRST_WEIGHT = 100.5
const SECOND_WEIGHT = 200.75

describe('transformFromSummaryLog', () => {
  it('transforms parsed RECEIVED_LOADS data into waste records', () => {
    const parsedData = {
      meta: {},
      data: {
        RECEIVED_LOADS: {
          location: { sheet: 'Sheet1', row: 1, column: 'A' },
          headers: ['ROW_ID', DATE_RECEIVED, 'GROSS_WEIGHT'],
          rows: [
            [FIRST_ROW_ID, FIRST_DATE, FIRST_WEIGHT],
            ['row-456', '2025-01-16', SECOND_WEIGHT]
          ]
        }
      }
    }

    const summaryLogContext = {
      summaryLogId: SUMMARY_LOG_ID,
      summaryLogUri: SUMMARY_LOG_URI,
      organisationId: 'org-1',
      registrationId: 'reg-1'
    }

    const result = transformFromSummaryLog(parsedData, summaryLogContext)

    expect(result).toHaveLength(2)
    expectValidWasteRecord(result[0], FIRST_ROW_ID, FIRST_DATE, FIRST_WEIGHT)
    expectValidWasteRecord(result[1], 'row-456', '2025-01-16', SECOND_WEIGHT)
  })

  it('returns empty array when no RECEIVED_LOADS data present', () => {
    const parsedData = {
      meta: {},
      data: {}
    }

    const summaryLogContext = {
      summaryLogId: SUMMARY_LOG_ID,
      summaryLogUri: SUMMARY_LOG_URI,
      organisationId: 'org-1',
      registrationId: 'reg-1'
    }

    const result = transformFromSummaryLog(parsedData, summaryLogContext)

    expect(result).toEqual([])
  })

  it('includes optional accreditationId when provided', () => {
    const parsedData = {
      meta: {},
      data: {
        RECEIVED_LOADS: {
          location: { sheet: 'Sheet1', row: 1, column: 'A' },
          headers: ['ROW_ID', DATE_RECEIVED],
          rows: [[FIRST_ROW_ID, FIRST_DATE]]
        }
      }
    }

    const summaryLogContext = {
      summaryLogId: SUMMARY_LOG_ID,
      summaryLogUri: SUMMARY_LOG_URI,
      organisationId: 'org-1',
      registrationId: 'reg-1',
      accreditationId: 'acc-1'
    }

    const result = transformFromSummaryLog(parsedData, summaryLogContext)

    expect(result[0].accreditationId).toBe('acc-1')
  })
})

function expectValidWasteRecord(record, rowId, dateReceived, grossWeight) {
  expect(record).toMatchObject({
    organisationId: 'org-1',
    registrationId: 'reg-1',
    rowId,
    type: WASTE_RECORD_TYPE.RECEIVED,
    data: {
      ROW_ID: rowId,
      DATE_RECEIVED: dateReceived,
      GROSS_WEIGHT: grossWeight
    }
  })

  expect(record.id).toBeTruthy()
  expect(record.versions).toHaveLength(1)
  expect(record.versions[0]).toMatchObject({
    status: VERSION_STATUS.CREATED,
    summaryLogId: SUMMARY_LOG_ID,
    summaryLogUri: SUMMARY_LOG_URI,
    data: {
      ROW_ID: rowId,
      DATE_RECEIVED: dateReceived,
      GROSS_WEIGHT: grossWeight
    }
  })
  expect(record.versions[0].id).toBeTruthy()
  expect(record.versions[0].createdAt).toBeTruthy()
}
