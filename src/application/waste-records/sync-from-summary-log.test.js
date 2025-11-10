import { describe, it, expect, beforeEach } from 'vitest'
import { syncFromSummaryLog } from './sync-from-summary-log.js'
import {
  WASTE_RECORD_TYPE,
  VERSION_STATUS
} from '#domain/waste-records/model.js'
import { createInMemoryWasteRecordsRepository } from '#repositories/waste-records/inmemory.js'
import { createInMemorySummaryLogExtractor } from '#application/summary-logs/extractor-inmemory.js'

const TEST_DATE_2025_01_15 = '2025-01-15'
const FIELD_GROSS_WEIGHT = 'GROSS_WEIGHT'
const TEST_WEIGHT_100_5 = 100.5
const TEST_WEIGHT_200_75 = 200.75
const TEST_WEIGHT_250_5 = 250.5

describe('syncFromSummaryLog', () => {
  let wasteRecordRepository

  beforeEach(() => {
    wasteRecordRepository = createInMemoryWasteRecordsRepository()()
  })

  it('extracts, transforms, and saves waste records from summary log', async () => {
    const fileId = 'test-file-123'
    const summaryLog = {
      file: {
        id: fileId,
        s3: {
          bucket: 'test-bucket',
          key: 'test-key'
        }
      },
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
          headers: [
            'ROW_ID',
            'DATE_RECEIVED_FOR_REPROCESSING',
            FIELD_GROSS_WEIGHT
          ],
          rows: [
            ['row-123', TEST_DATE_2025_01_15, TEST_WEIGHT_100_5],
            ['row-456', '2025-01-16', TEST_WEIGHT_200_75]
          ]
        }
      }
    }

    const extractor = createInMemorySummaryLogExtractor({
      [fileId]: parsedData
    })

    const sync = syncFromSummaryLog({
      extractor,
      wasteRecordRepository
    })

    await sync(summaryLog)

    // Verify records were saved
    const savedRecords = await wasteRecordRepository.findByRegistration(
      'org-1',
      'reg-1'
    )
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
        DATE_RECEIVED_FOR_REPROCESSING: TEST_DATE_2025_01_15,
        GROSS_WEIGHT: TEST_WEIGHT_100_5
      },
      versions: [
        {
          createdAt: '2025-01-15T10:00:00.000Z',
          status: VERSION_STATUS.CREATED,
          summaryLog: {
            id: 'test-file-initial',
            uri: 's3://bucket/key'
          },
          data: {
            ROW_ID: 'row-123',
            DATE_RECEIVED_FOR_REPROCESSING: TEST_DATE_2025_01_15,
            GROSS_WEIGHT: TEST_WEIGHT_100_5
          }
        }
      ]
    }

    await wasteRecordRepository.upsertWasteRecords([existingRecord])

    const fileId = 'test-file-456'
    const summaryLog = {
      file: {
        id: fileId,
        s3: {
          bucket: 'test-bucket',
          key: 'test-key-2'
        }
      },
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
          headers: [
            'ROW_ID',
            'DATE_RECEIVED_FOR_REPROCESSING',
            FIELD_GROSS_WEIGHT
          ],
          rows: [['row-123', '2025-01-20', TEST_WEIGHT_250_5]]
        }
      }
    }

    const extractor = createInMemorySummaryLogExtractor({
      [fileId]: parsedData
    })

    const sync = syncFromSummaryLog({
      extractor,
      wasteRecordRepository
    })

    await sync(summaryLog)

    // Verify record was updated
    const savedRecords = await wasteRecordRepository.findByRegistration(
      'org-1',
      'reg-1'
    )
    expect(savedRecords).toHaveLength(1)
    expect(savedRecords[0].versions).toHaveLength(2)
    expect(savedRecords[0].versions[1].status).toBe(VERSION_STATUS.UPDATED)
    expect(savedRecords[0].data[FIELD_GROSS_WEIGHT]).toBe(TEST_WEIGHT_250_5)
  })

  it('should not create new version when row data is unchanged', async () => {
    // First, save an initial record
    const existingRecord = {
      organisationId: 'org-1',
      registrationId: 'reg-1',
      rowId: 'row-123',
      type: WASTE_RECORD_TYPE.RECEIVED,
      data: {
        ROW_ID: 'row-123',
        DATE_RECEIVED_FOR_REPROCESSING: TEST_DATE_2025_01_15,
        GROSS_WEIGHT: TEST_WEIGHT_100_5
      },
      versions: [
        {
          createdAt: '2025-01-15T10:00:00.000Z',
          status: VERSION_STATUS.CREATED,
          summaryLog: {
            id: 'test-file-initial',
            uri: 's3://bucket/key'
          },
          data: {
            ROW_ID: 'row-123',
            DATE_RECEIVED_FOR_REPROCESSING: TEST_DATE_2025_01_15,
            GROSS_WEIGHT: TEST_WEIGHT_100_5
          }
        }
      ]
    }

    await wasteRecordRepository.upsertWasteRecords([existingRecord])

    // Submit the same data again
    const fileId = 'test-file-unchanged'
    const summaryLog = {
      file: {
        id: fileId,
        s3: {
          bucket: 'test-bucket',
          key: 'test-key-unchanged'
        }
      },
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
          headers: [
            'ROW_ID',
            'DATE_RECEIVED_FOR_REPROCESSING',
            FIELD_GROSS_WEIGHT
          ],
          rows: [
            // Exact same data as existing record
            ['row-123', TEST_DATE_2025_01_15, TEST_WEIGHT_100_5]
          ]
        }
      }
    }

    const extractor = createInMemorySummaryLogExtractor({
      [fileId]: parsedData
    })

    const sync = syncFromSummaryLog({
      extractor,
      wasteRecordRepository
    })

    await sync(summaryLog)

    // Verify no new version was created
    const savedRecords = await wasteRecordRepository.findByRegistration(
      'org-1',
      'reg-1'
    )
    expect(savedRecords).toHaveLength(1)
    expect(savedRecords[0].versions).toHaveLength(1) // Still only 1 version
    expect(savedRecords[0].versions[0].status).toBe(VERSION_STATUS.CREATED)
  })

  it('should create UPDATED version with delta when single field changes', async () => {
    // First, save an initial record
    const existingRecord = {
      organisationId: 'org-1',
      registrationId: 'reg-1',
      rowId: 'row-123',
      type: WASTE_RECORD_TYPE.RECEIVED,
      data: {
        ROW_ID: 'row-123',
        DATE_RECEIVED_FOR_REPROCESSING: TEST_DATE_2025_01_15,
        GROSS_WEIGHT: TEST_WEIGHT_100_5
      },
      versions: [
        {
          createdAt: '2025-01-15T10:00:00.000Z',
          status: VERSION_STATUS.CREATED,
          summaryLog: {
            id: 'test-file-initial',
            uri: 's3://bucket/key'
          },
          data: {
            ROW_ID: 'row-123',
            DATE_RECEIVED_FOR_REPROCESSING: TEST_DATE_2025_01_15,
            GROSS_WEIGHT: TEST_WEIGHT_100_5
          }
        }
      ]
    }

    await wasteRecordRepository.upsertWasteRecords([existingRecord])

    // Submit with only GROSS_WEIGHT changed
    const fileId = 'test-file-delta'
    const summaryLog = {
      file: {
        id: fileId,
        s3: {
          bucket: 'test-bucket',
          key: 'test-key-delta'
        }
      },
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
          headers: [
            'ROW_ID',
            'DATE_RECEIVED_FOR_REPROCESSING',
            FIELD_GROSS_WEIGHT
          ],
          rows: [
            ['row-123', TEST_DATE_2025_01_15, TEST_WEIGHT_200_75] // Only weight changed
          ]
        }
      }
    }

    const extractor = createInMemorySummaryLogExtractor({
      [fileId]: parsedData
    })

    const sync = syncFromSummaryLog({
      extractor,
      wasteRecordRepository
    })

    await sync(summaryLog)

    const savedRecords = await wasteRecordRepository.findByRegistration(
      'org-1',
      'reg-1'
    )
    expect(savedRecords).toHaveLength(1)
    expect(savedRecords[0].versions).toHaveLength(2)

    // Second version should have UPDATED status
    const updatedVersion = savedRecords[0].versions[1]
    expect(updatedVersion.status).toBe(VERSION_STATUS.UPDATED)

    // UPDATED version should contain only the changed field (delta)
    expect(updatedVersion.data).toEqual({
      GROSS_WEIGHT: TEST_WEIGHT_200_75
    })

    // Top-level data should reflect current state
    expect(savedRecords[0].data[FIELD_GROSS_WEIGHT]).toBe(TEST_WEIGHT_200_75)
  })

  it('should include all changed fields in UPDATED version delta', async () => {
    // First, save an initial record
    const existingRecord = {
      organisationId: 'org-1',
      registrationId: 'reg-1',
      rowId: 'row-123',
      type: WASTE_RECORD_TYPE.RECEIVED,
      data: {
        ROW_ID: 'row-123',
        DATE_RECEIVED_FOR_REPROCESSING: TEST_DATE_2025_01_15,
        GROSS_WEIGHT: TEST_WEIGHT_100_5
      },
      versions: [
        {
          createdAt: '2025-01-15T10:00:00.000Z',
          status: VERSION_STATUS.CREATED,
          summaryLog: {
            id: 'test-file-initial',
            uri: 's3://bucket/key'
          },
          data: {
            ROW_ID: 'row-123',
            DATE_RECEIVED_FOR_REPROCESSING: TEST_DATE_2025_01_15,
            GROSS_WEIGHT: TEST_WEIGHT_100_5
          }
        }
      ]
    }

    await wasteRecordRepository.upsertWasteRecords([existingRecord])

    // Submit with both date and weight changed
    const fileId = 'test-file-multi-delta'
    const summaryLog = {
      file: {
        id: fileId,
        s3: {
          bucket: 'test-bucket',
          key: 'test-key-multi'
        }
      },
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
          headers: [
            'ROW_ID',
            'DATE_RECEIVED_FOR_REPROCESSING',
            FIELD_GROSS_WEIGHT
          ],
          rows: [
            ['row-123', '2025-01-20', TEST_WEIGHT_250_5] // Both date and weight changed
          ]
        }
      }
    }

    const extractor = createInMemorySummaryLogExtractor({
      [fileId]: parsedData
    })

    const sync = syncFromSummaryLog({
      extractor,
      wasteRecordRepository
    })

    await sync(summaryLog)

    const savedRecords = await wasteRecordRepository.findByRegistration(
      'org-1',
      'reg-1'
    )
    expect(savedRecords).toHaveLength(1)
    expect(savedRecords[0].versions).toHaveLength(2)

    // Second version should contain both changed fields
    const updatedVersion = savedRecords[0].versions[1]
    expect(updatedVersion.status).toBe(VERSION_STATUS.UPDATED)
    expect(updatedVersion.data).toEqual({
      DATE_RECEIVED_FOR_REPROCESSING: '2025-01-20',
      GROSS_WEIGHT: TEST_WEIGHT_250_5
    })

    // ROW_ID shouldn't be in delta as it didn't change
    expect(updatedVersion.data).not.toHaveProperty('ROW_ID')
  })
})
