import { describe, it, expect } from 'vitest'
import { transformFromSummaryLog } from './transform-from-summary-log.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/type.js'
import { VERSION_STATUS } from '#domain/waste-records/version-status.js'

describe('transformFromSummaryLog', () => {
  it('transforms parsed RECEIVED_LOADS data into waste records', () => {
    const parsedData = {
      meta: {},
      data: {
        RECEIVED_LOADS: {
          location: { sheet: 'Sheet1', row: 1, column: 'A' },
          headers: ['ROW_ID', 'DATE_RECEIVED', 'GROSS_WEIGHT'],
          rows: [
            ['row-123', '2025-01-15', 100.5],
            ['row-456', '2025-01-16', 200.75]
          ]
        }
      }
    }

    const summaryLogContext = {
      summaryLogId: 'summary-log-1',
      summaryLogUri: 's3://bucket/key',
      organisationId: 'org-1',
      registrationId: 'reg-1'
    }

    const result = transformFromSummaryLog(parsedData, summaryLogContext)

    expect(result).toHaveLength(2)

    // First waste record
    expect(result[0]).toMatchObject({
      organisationId: 'org-1',
      registrationId: 'reg-1',
      rowId: 'row-123',
      type: WASTE_RECORD_TYPE.RECEIVED,
      data: {
        ROW_ID: 'row-123',
        DATE_RECEIVED: '2025-01-15',
        GROSS_WEIGHT: 100.5
      }
    })

    expect(result[0].id).toBeTruthy()
    expect(result[0].versions).toHaveLength(1)
    expect(result[0].versions[0]).toMatchObject({
      status: VERSION_STATUS.CREATED,
      summaryLogId: 'summary-log-1',
      summaryLogUri: 's3://bucket/key',
      data: {
        ROW_ID: 'row-123',
        DATE_RECEIVED: '2025-01-15',
        GROSS_WEIGHT: 100.5
      }
    })
    expect(result[0].versions[0].id).toBeTruthy()
    expect(result[0].versions[0].createdAt).toBeTruthy()

    // Second waste record
    expect(result[1]).toMatchObject({
      organisationId: 'org-1',
      registrationId: 'reg-1',
      rowId: 'row-456',
      type: WASTE_RECORD_TYPE.RECEIVED,
      data: {
        ROW_ID: 'row-456',
        DATE_RECEIVED: '2025-01-16',
        GROSS_WEIGHT: 200.75
      }
    })
  })

  it('returns empty array when no RECEIVED_LOADS data present', () => {
    const parsedData = {
      meta: {},
      data: {}
    }

    const summaryLogContext = {
      summaryLogId: 'summary-log-1',
      summaryLogUri: 's3://bucket/key',
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
          headers: ['ROW_ID', 'DATE_RECEIVED'],
          rows: [['row-123', '2025-01-15']]
        }
      }
    }

    const summaryLogContext = {
      summaryLogId: 'summary-log-1',
      summaryLogUri: 's3://bucket/key',
      organisationId: 'org-1',
      registrationId: 'reg-1',
      accreditationId: 'acc-1'
    }

    const result = transformFromSummaryLog(parsedData, summaryLogContext)

    expect(result[0].accreditationId).toBe('acc-1')
  })
})
