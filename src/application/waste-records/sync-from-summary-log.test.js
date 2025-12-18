import { describe, it, expect, beforeEach, vi } from 'vitest'
import { syncFromSummaryLog } from './sync-from-summary-log.js'
import {
  WASTE_RECORD_TYPE,
  VERSION_STATUS
} from '#domain/waste-records/model.js'
import { createInMemoryWasteRecordsRepository } from '#repositories/waste-records/inmemory.js'
import { createInMemorySummaryLogExtractor } from '#application/summary-logs/extractor-inmemory.js'
import {
  buildVersionData,
  toWasteRecordVersions
} from '#repositories/waste-records/contract/test-data.js'

const TEST_DATE_2025_01_15 = '2025-01-15'
const FIELD_GROSS_WEIGHT = 'GROSS_WEIGHT'
const TEST_WEIGHT_100_5 = 100.5
const TEST_WEIGHT_200_75 = 200.75
const TEST_WEIGHT_250_5 = 250.5

describe('syncFromSummaryLog', () => {
  let wasteRecordRepository
  let wasteBalancesRepository
  let organisationsRepository

  beforeEach(() => {
    wasteRecordRepository = createInMemoryWasteRecordsRepository()()
    wasteBalancesRepository = {
      updateWasteBalanceTransactions: vi.fn()
    }
    organisationsRepository = {}
  })

  it('extracts, transforms, and saves waste records from summary log', async () => {
    const fileId = 'test-file-123'
    const summaryLog = {
      file: {
        id: fileId,
        uri: 's3://test-bucket/test-key'
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
            {
              rowNumber: 2,
              values: ['row-123', TEST_DATE_2025_01_15, TEST_WEIGHT_100_5]
            },
            {
              rowNumber: 3,
              values: ['row-456', '2025-01-16', TEST_WEIGHT_200_75]
            }
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
    const initialData = {
      DATE_RECEIVED_FOR_REPROCESSING: TEST_DATE_2025_01_15,
      GROSS_WEIGHT: TEST_WEIGHT_100_5
    }

    const { version, data } = buildVersionData({
      summaryLogId: 'test-file-initial',
      summaryLogUri: 's3://bucket/key',
      createdAt: '2025-01-15T10:00:00.000Z',
      status: VERSION_STATUS.CREATED,
      versionData: initialData,
      currentData: initialData
    })

    const wasteRecordVersions = toWasteRecordVersions({
      received: {
        'row-123': { version, data }
      }
    })

    await wasteRecordRepository.appendVersions(
      'org-1',
      'reg-1',
      wasteRecordVersions
    )

    const fileId = 'test-file-456'
    const summaryLog = {
      file: {
        id: fileId,
        uri: 's3://test-bucket/test-key-2'
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
            {
              rowNumber: 2,
              values: ['row-123', '2025-01-20', TEST_WEIGHT_250_5]
            }
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
    const initialData = {
      DATE_RECEIVED_FOR_REPROCESSING: TEST_DATE_2025_01_15,
      GROSS_WEIGHT: TEST_WEIGHT_100_5
    }

    const { version, data } = buildVersionData({
      summaryLogId: 'test-file-initial',
      summaryLogUri: 's3://bucket/key',
      createdAt: '2025-01-15T10:00:00.000Z',
      status: VERSION_STATUS.CREATED,
      versionData: initialData,
      currentData: initialData
    })

    const wasteRecordVersions = toWasteRecordVersions({
      received: {
        'row-123': { version, data }
      }
    })

    await wasteRecordRepository.appendVersions(
      'org-1',
      'reg-1',
      wasteRecordVersions
    )

    // Submit the same data again
    const fileId = 'test-file-unchanged'
    const summaryLog = {
      file: {
        id: fileId,
        uri: 's3://test-bucket/test-key-unchanged'
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
            {
              rowNumber: 2,
              values: ['row-123', TEST_DATE_2025_01_15, TEST_WEIGHT_100_5]
            }
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

  it('should lookup accreditationId from organisationsRepository if missing in summaryLog', async () => {
    const fileId = 'test-file-lookup'
    const summaryLog = {
      file: {
        id: fileId,
        uri: 's3://test-bucket/test-key'
      },
      organisationId: 'org-1',
      registrationId: 'reg-1'
      // accreditationId is missing
    }

    const parsedData = {
      meta: {
        PROCESSING_TYPE: {
          value: 'EXPORTER'
        }
      },
      data: {
        RECEIVED_LOADS_FOR_EXPORT: {
          location: { sheet: 'Sheet1', row: 1, column: 'A' },
          headers: [
            'ROW_ID',
            'DATE_OF_EXPORT',
            'TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED'
          ],
          rows: [
            {
              rowNumber: 2,
              values: ['row-123', TEST_DATE_2025_01_15, 10]
            }
          ]
        }
      }
    }

    const extractor = createInMemorySummaryLogExtractor({
      [fileId]: parsedData
    })

    organisationsRepository.findRegistrationById = vi
      .fn()
      .mockResolvedValue({ accreditationId: 'acc-from-repo' })

    const featureFlags = {
      isCalculateWasteBalanceOnImportEnabled: vi.fn().mockReturnValue(true)
    }

    const sync = syncFromSummaryLog({
      extractor,
      wasteRecordRepository,
      wasteBalancesRepository,
      organisationsRepository,
      featureFlags
    })

    await sync(summaryLog)

    expect(organisationsRepository.findRegistrationById).toHaveBeenCalledWith(
      'org-1',
      'reg-1'
    )
    expect(
      wasteBalancesRepository.updateWasteBalanceTransactions
    ).toHaveBeenCalledWith(expect.any(Array), 'acc-from-repo')
  })

  it('should create UPDATED version with delta when single field changes', async () => {
    // First, save an initial record
    const initialData = {
      DATE_RECEIVED_FOR_REPROCESSING: TEST_DATE_2025_01_15,
      GROSS_WEIGHT: TEST_WEIGHT_100_5
    }

    const { version, data } = buildVersionData({
      summaryLogId: 'test-file-initial',
      summaryLogUri: 's3://bucket/key',
      createdAt: '2025-01-15T10:00:00.000Z',
      status: VERSION_STATUS.CREATED,
      versionData: initialData,
      currentData: initialData
    })

    const wasteRecordVersions = toWasteRecordVersions({
      received: {
        'row-123': { version, data }
      }
    })

    await wasteRecordRepository.appendVersions(
      'org-1',
      'reg-1',
      wasteRecordVersions
    )

    // Submit with only GROSS_WEIGHT changed
    const fileId = 'test-file-delta'
    const summaryLog = {
      file: {
        id: fileId,
        uri: 's3://test-bucket/test-key-delta'
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
            {
              rowNumber: 2,
              values: ['row-123', TEST_DATE_2025_01_15, TEST_WEIGHT_200_75]
            } // Only weight changed
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
    const initialData = {
      DATE_RECEIVED_FOR_REPROCESSING: TEST_DATE_2025_01_15,
      GROSS_WEIGHT: TEST_WEIGHT_100_5
    }

    const { version, data } = buildVersionData({
      summaryLogId: 'test-file-initial',
      summaryLogUri: 's3://bucket/key',
      createdAt: '2025-01-15T10:00:00.000Z',
      status: VERSION_STATUS.CREATED,
      versionData: initialData,
      currentData: initialData
    })

    const wasteRecordVersions = toWasteRecordVersions({
      received: {
        'row-123': { version, data }
      }
    })

    await wasteRecordRepository.appendVersions(
      'org-1',
      'reg-1',
      wasteRecordVersions
    )

    // Submit with both date and weight changed
    const fileId = 'test-file-multi-delta'
    const summaryLog = {
      file: {
        id: fileId,
        uri: 's3://test-bucket/test-key-multi'
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
            {
              rowNumber: 2,
              values: ['row-123', '2025-01-20', TEST_WEIGHT_250_5]
            } // Both date and weight changed
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

  it('handles headers with null values and EPR markers', async () => {
    const fileId = 'test-file-markers'
    const summaryLog = {
      file: {
        id: fileId,
        uri: 's3://test-bucket/test-key-markers'
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
            null,
            'EPR:TABLE_START',
            'DATE_RECEIVED_FOR_REPROCESSING',
            FIELD_GROSS_WEIGHT
          ],
          rows: [
            {
              rowNumber: 2,
              values: [
                'row-789',
                'ignored',
                'also-ignored',
                TEST_DATE_2025_01_15,
                TEST_WEIGHT_100_5
              ]
            }
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
    expect(savedRecords[0].rowId).toBe('row-789')
  })

  it('skips tables without schemas', async () => {
    const fileId = 'test-file-unknown-table'
    const summaryLog = {
      file: {
        id: fileId,
        uri: 's3://test-bucket/test-key-unknown'
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
        UNKNOWN_TABLE: {
          location: { sheet: 'Sheet1', row: 1, column: 'A' },
          headers: ['SOME_FIELD'],
          rows: [{ rowNumber: 2, values: ['some-value'] }]
        },
        RECEIVED_LOADS_FOR_REPROCESSING: {
          location: { sheet: 'Sheet1', row: 10, column: 'A' },
          headers: [
            'ROW_ID',
            'DATE_RECEIVED_FOR_REPROCESSING',
            FIELD_GROSS_WEIGHT
          ],
          rows: [
            {
              rowNumber: 11,
              values: ['row-999', TEST_DATE_2025_01_15, TEST_WEIGHT_100_5]
            }
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

    // Only the known table should have been processed
    const savedRecords = await wasteRecordRepository.findByRegistration(
      'org-1',
      'reg-1'
    )
    expect(savedRecords).toHaveLength(1)
    expect(savedRecords[0].rowId).toBe('row-999')
  })

  it('all records from same sync have identical timestamps', async () => {
    const fileId = 'test-file-timestamps'
    const summaryLog = {
      file: {
        id: fileId,
        uri: 's3://test-bucket/test-key-timestamps'
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
            {
              rowNumber: 2,
              values: ['row-001', TEST_DATE_2025_01_15, TEST_WEIGHT_100_5]
            },
            {
              rowNumber: 3,
              values: ['row-002', '2025-01-16', TEST_WEIGHT_200_75]
            },
            {
              rowNumber: 4,
              values: ['row-003', '2025-01-17', TEST_WEIGHT_250_5]
            }
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
    expect(savedRecords).toHaveLength(3)

    // All records should have identical timestamps
    const timestamps = savedRecords.map((r) => r.versions[0].createdAt)
    expect(timestamps[0]).toBe(timestamps[1])
    expect(timestamps[1]).toBe(timestamps[2])

    // Timestamp should be a valid ISO string
    expect(timestamps[0]).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
    )
  })

  it('updates waste balances when accreditationId is present', async () => {
    const fileId = 'test-file-wb'
    const summaryLog = {
      file: {
        id: fileId,
        uri: 's3://test-bucket/test-key'
      },
      organisationId: 'org-1',
      registrationId: 'reg-1',
      accreditationId: 'acc-1'
    }

    const parsedData = {
      meta: {
        PROCESSING_TYPE: {
          value: 'EXPORTER'
        }
      },
      data: {
        RECEIVED_LOADS_FOR_EXPORT: {
          location: { sheet: 'Sheet1', row: 1, column: 'A' },
          headers: [
            'ROW_ID',
            'DATE_RECEIVED_FOR_REPROCESSING',
            FIELD_GROSS_WEIGHT
          ],
          rows: [
            {
              rowNumber: 2,
              values: ['row-123', TEST_DATE_2025_01_15, TEST_WEIGHT_100_5]
            }
          ]
        }
      }
    }

    const extractor = createInMemorySummaryLogExtractor({
      [fileId]: parsedData
    })

    const featureFlags = {
      isCalculateWasteBalanceOnImportEnabled: vi.fn().mockReturnValue(true)
    }

    const sync = syncFromSummaryLog({
      extractor,
      wasteRecordRepository,
      wasteBalancesRepository,
      organisationsRepository,
      featureFlags
    })

    await sync(summaryLog)

    expect(
      wasteBalancesRepository.updateWasteBalanceTransactions
    ).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          rowId: 'row-123',
          type: WASTE_RECORD_TYPE.EXPORTED
        })
      ]),
      'acc-1'
    )
  })

  it('does not attempt to fetch accreditationId if organisationsRepository is not provided', async () => {
    const summaryLog = {
      file: { id: 'file-1', uri: 's3://bucket/key' },
      organisationId: 'org-1',
      registrationId: 'reg-1'
      // accreditationId is missing
    }

    const extractor = {
      extract: vi.fn().mockResolvedValue({
        meta: { PROCESSING_TYPE: { value: 'REPROCESSOR_INPUT' } },
        data: {}
      })
    }

    const sync = syncFromSummaryLog({
      extractor,
      wasteRecordRepository,
      wasteBalancesRepository,
      organisationsRepository: undefined
    })

    await sync(summaryLog)

    // If it didn't crash, it passed the check
    expect(true).toBe(true)
  })

  it('does not update accreditationId if registration is not found', async () => {
    const summaryLog = {
      file: { id: 'file-1', uri: 's3://bucket/key' },
      organisationId: 'org-1',
      registrationId: 'reg-1'
      // accreditationId is missing
    }

    const extractor = {
      extract: vi.fn().mockResolvedValue({
        meta: { PROCESSING_TYPE: { value: 'REPROCESSOR_INPUT' } },
        data: {}
      })
    }

    const organisationsRepository = {
      findRegistrationById: vi.fn().mockResolvedValue(null)
    }

    const sync = syncFromSummaryLog({
      extractor,
      wasteRecordRepository,
      wasteBalancesRepository,
      organisationsRepository
    })

    await sync(summaryLog)

    expect(organisationsRepository.findRegistrationById).toHaveBeenCalled()
  })

  it('does not update waste balances when feature flag is disabled', async () => {
    const fileId = 'test-file-wb-disabled'
    const summaryLog = {
      file: {
        id: fileId,
        uri: 's3://test-bucket/test-key'
      },
      organisationId: 'org-1',
      registrationId: 'reg-1',
      accreditationId: 'acc-1'
    }

    const parsedData = {
      meta: {
        PROCESSING_TYPE: {
          value: 'EXPORTER'
        }
      },
      data: {
        RECEIVED_LOADS_FOR_EXPORT: {
          location: { sheet: 'Sheet1', row: 1, column: 'A' },
          headers: [
            'ROW_ID',
            'DATE_RECEIVED_FOR_REPROCESSING',
            FIELD_GROSS_WEIGHT
          ],
          rows: [
            {
              rowNumber: 2,
              values: ['row-123', TEST_DATE_2025_01_15, TEST_WEIGHT_100_5]
            }
          ]
        }
      }
    }

    const extractor = createInMemorySummaryLogExtractor({
      [fileId]: parsedData
    })

    const featureFlags = {
      isCalculateWasteBalanceOnImportEnabled: vi.fn().mockReturnValue(false)
    }

    const sync = syncFromSummaryLog({
      extractor,
      wasteRecordRepository,
      wasteBalancesRepository,
      organisationsRepository,
      featureFlags
    })

    await sync(summaryLog)

    expect(
      wasteBalancesRepository.updateWasteBalanceTransactions
    ).not.toHaveBeenCalled()
  })
})
