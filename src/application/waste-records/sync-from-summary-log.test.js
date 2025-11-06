import { describe, it, expect, beforeEach } from 'vitest'
import { syncFromSummaryLog } from './sync-from-summary-log.js'
import {
  WASTE_RECORD_TYPE,
  VERSION_STATUS
} from '#domain/waste-records/model.js'
import { createInMemoryWasteRecordsRepository } from '#repositories/waste-records/inmemory.js'

describe('syncFromSummaryLog', () => {
  let wasteRecordRepository

  beforeEach(() => {
    wasteRecordRepository = createInMemoryWasteRecordsRepository()()
  })

  it('extracts, transforms, and saves waste records from summary log', async () => {
    const summaryLog = {
      id: 'summary-log-1',
      uri: 's3://bucket/key',
      organisationId: 'org-1',
      registrationId: 'reg-1'
    }

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
            ['row-123', '2025-01-15', 100.5],
            ['row-456', '2025-01-16', 200.75]
          ]
        }
      }
    }

    const extractorStub = {
      extract: async (summaryLogUri) => {
        expect(summaryLogUri).toBe('s3://bucket/key')
        return parsedData
      }
    }

    const sync = syncFromSummaryLog({
      extractor: extractorStub,
      wasteRecordRepository
    })

    await sync(summaryLog)

    // Verify records were saved
    const savedRecords = await wasteRecordRepository.findAll('org-1', 'reg-1')
    expect(savedRecords).toHaveLength(2)
    expect(savedRecords[0]).toMatchObject({
      organisationId: 'org-1',
      registrationId: 'reg-1',
      rowId: 'row-123',
      type: WASTE_RECORD_TYPE.RECEIVED
    })
    expect(savedRecords[1]).toMatchObject({
      organisationId: 'org-1',
      registrationId: 'reg-1',
      rowId: 'row-456',
      type: WASTE_RECORD_TYPE.RECEIVED
    })
  })

  it('updates existing waste records when rowId already exists', async () => {
    // First, save an initial record
    const existingRecord = {
      organisationId: 'org-1',
      registrationId: 'reg-1',
      rowId: 'row-123',
      type: WASTE_RECORD_TYPE.RECEIVED,
      data: {
        ROW_ID: 'row-123',
        DATE_RECEIVED_FOR_REPROCESSING: '2025-01-15',
        GROSS_WEIGHT: 100.5
      },
      versions: [
        {
          createdAt: '2025-01-15T10:00:00.000Z',
          status: VERSION_STATUS.CREATED,
          summaryLog: {
            id: 'summary-log-1',
            uri: 's3://bucket/key'
          },
          data: {
            ROW_ID: 'row-123',
            DATE_RECEIVED_FOR_REPROCESSING: '2025-01-15',
            GROSS_WEIGHT: 100.5
          }
        }
      ]
    }

    await wasteRecordRepository.saveAll([existingRecord])

    const summaryLog = {
      id: 'summary-log-2',
      uri: 's3://bucket/key2',
      organisationId: 'org-1',
      registrationId: 'reg-1'
    }

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
          rows: [['row-123', '2025-01-20', 250.5]]
        }
      }
    }

    const extractorStub = {
      extract: async () => parsedData
    }

    const sync = syncFromSummaryLog({
      extractor: extractorStub,
      wasteRecordRepository
    })

    await sync(summaryLog)

    // Verify record was updated
    const savedRecords = await wasteRecordRepository.findAll('org-1', 'reg-1')
    expect(savedRecords).toHaveLength(1)
    expect(savedRecords[0].versions).toHaveLength(2)
    expect(savedRecords[0].versions[1].status).toBe(VERSION_STATUS.UPDATED)
    expect(savedRecords[0].data.GROSS_WEIGHT).toBe(250.5)
  })
})
