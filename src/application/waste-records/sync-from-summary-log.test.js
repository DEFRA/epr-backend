import { describe, it, expect, beforeEach } from 'vitest'
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

/**
 * All required headers for RECEIVED_LOADS_FOR_REPROCESSING table
 */
const VALID_HEADERS = [
  'ROW_ID',
  'DATE_RECEIVED_FOR_REPROCESSING',
  'EWC_CODE',
  'GROSS_WEIGHT',
  'TARE_WEIGHT',
  'PALLET_WEIGHT',
  'NET_WEIGHT',
  'BAILING_WIRE_PROTOCOL',
  'HOW_DID_YOU_CALCULATE_RECYCLABLE_PROPORTION',
  'WEIGHT_OF_NON_TARGET_MATERIALS',
  'RECYCLABLE_PROPORTION_PERCENTAGE',
  'TONNAGE_RECEIVED_FOR_RECYCLING'
]

/**
 * Creates a valid row that passes validation
 * @param {Object} overrides - Field overrides
 * @returns {Array} Row values array
 */
const createValidRow = (overrides = {}) => {
  const defaults = {
    ROW_ID: 10001,
    DATE_RECEIVED_FOR_REPROCESSING: TEST_DATE_2025_01_15,
    EWC_CODE: '03 03 08',
    GROSS_WEIGHT: TEST_WEIGHT_100_5,
    TARE_WEIGHT: 10,
    PALLET_WEIGHT: 5,
    NET_WEIGHT: 85.5,
    BAILING_WIRE_PROTOCOL: 'Yes',
    HOW_DID_YOU_CALCULATE_RECYCLABLE_PROPORTION: 'Actual weight (100%)',
    WEIGHT_OF_NON_TARGET_MATERIALS: 5,
    RECYCLABLE_PROPORTION_PERCENTAGE: 0.95,
    TONNAGE_RECEIVED_FOR_RECYCLING: 81.225
  }
  const merged = { ...defaults, ...overrides }
  return VALID_HEADERS.map((header) => merged[header])
}

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
          headers: VALID_HEADERS,
          rows: [
            createValidRow({ ROW_ID: 10001, GROSS_WEIGHT: TEST_WEIGHT_100_5 }),
            createValidRow({
              ROW_ID: 10002,
              DATE_RECEIVED_FOR_REPROCESSING: '2025-01-16',
              GROSS_WEIGHT: TEST_WEIGHT_200_75
            })
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
      rowId: '10001',
      type: WASTE_RECORD_TYPE.RECEIVED
    })
    expect(savedRecords[1]).toMatchObject({
      organisationId: 'org-1',
      registrationId: 'reg-1',
      rowId: '10002',
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
        '10001': { version, data }
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
          headers: VALID_HEADERS,
          rows: [
            createValidRow({
              ROW_ID: 10001,
              DATE_RECEIVED_FOR_REPROCESSING: '2025-01-20',
              GROSS_WEIGHT: TEST_WEIGHT_250_5
            })
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
    // First, save an initial record with all required fields
    const initialData = {
      DATE_RECEIVED_FOR_REPROCESSING: TEST_DATE_2025_01_15,
      EWC_CODE: '03 03 08',
      GROSS_WEIGHT: TEST_WEIGHT_100_5,
      TARE_WEIGHT: 10,
      PALLET_WEIGHT: 5,
      NET_WEIGHT: 85.5,
      BAILING_WIRE_PROTOCOL: 'Yes',
      HOW_DID_YOU_CALCULATE_RECYCLABLE_PROPORTION: 'Actual weight (100%)',
      WEIGHT_OF_NON_TARGET_MATERIALS: 5,
      RECYCLABLE_PROPORTION_PERCENTAGE: 0.95,
      TONNAGE_RECEIVED_FOR_RECYCLING: 81.225
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
        '10001': { version, data }
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
          headers: VALID_HEADERS,
          rows: [
            // Exact same data as existing record
            createValidRow({ ROW_ID: 10001, GROSS_WEIGHT: TEST_WEIGHT_100_5 })
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
    // First, save an initial record with all required fields
    const initialData = {
      DATE_RECEIVED_FOR_REPROCESSING: TEST_DATE_2025_01_15,
      EWC_CODE: '03 03 08',
      GROSS_WEIGHT: TEST_WEIGHT_100_5,
      TARE_WEIGHT: 10,
      PALLET_WEIGHT: 5,
      NET_WEIGHT: 85.5,
      BAILING_WIRE_PROTOCOL: 'Yes',
      HOW_DID_YOU_CALCULATE_RECYCLABLE_PROPORTION: 'Actual weight (100%)',
      WEIGHT_OF_NON_TARGET_MATERIALS: 5,
      RECYCLABLE_PROPORTION_PERCENTAGE: 0.95,
      TONNAGE_RECEIVED_FOR_RECYCLING: 81.225
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
        '10001': { version, data }
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
          headers: VALID_HEADERS,
          rows: [
            createValidRow({
              ROW_ID: 10001,
              GROSS_WEIGHT: TEST_WEIGHT_200_75
            }) // Only weight changed
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
    // First, save an initial record with all required fields
    const initialData = {
      DATE_RECEIVED_FOR_REPROCESSING: TEST_DATE_2025_01_15,
      EWC_CODE: '03 03 08',
      GROSS_WEIGHT: TEST_WEIGHT_100_5,
      TARE_WEIGHT: 10,
      PALLET_WEIGHT: 5,
      NET_WEIGHT: 85.5,
      BAILING_WIRE_PROTOCOL: 'Yes',
      HOW_DID_YOU_CALCULATE_RECYCLABLE_PROPORTION: 'Actual weight (100%)',
      WEIGHT_OF_NON_TARGET_MATERIALS: 5,
      RECYCLABLE_PROPORTION_PERCENTAGE: 0.95,
      TONNAGE_RECEIVED_FOR_RECYCLING: 81.225
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
        '10001': { version, data }
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
          headers: VALID_HEADERS,
          rows: [
            createValidRow({
              ROW_ID: 10001,
              DATE_RECEIVED_FOR_REPROCESSING: '2025-01-20',
              GROSS_WEIGHT: TEST_WEIGHT_250_5
            }) // Both date and weight changed
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

    // Headers with nulls and EPR markers interspersed
    const headersWithMarkers = [
      'ROW_ID',
      null,
      'EPR:TABLE_START',
      'DATE_RECEIVED_FOR_REPROCESSING',
      'EWC_CODE',
      'GROSS_WEIGHT',
      'TARE_WEIGHT',
      'PALLET_WEIGHT',
      'NET_WEIGHT',
      'BAILING_WIRE_PROTOCOL',
      'HOW_DID_YOU_CALCULATE_RECYCLABLE_PROPORTION',
      'WEIGHT_OF_NON_TARGET_MATERIALS',
      'RECYCLABLE_PROPORTION_PERCENTAGE',
      'TONNAGE_RECEIVED_FOR_RECYCLING'
    ]

    const parsedData = {
      meta: {
        PROCESSING_TYPE: {
          value: 'REPROCESSOR_INPUT'
        }
      },
      data: {
        RECEIVED_LOADS_FOR_REPROCESSING: {
          location: { sheet: 'Sheet1', row: 1, column: 'A' },
          headers: headersWithMarkers,
          rows: [
            [
              10001, // ROW_ID
              'ignored', // null column
              'also-ignored', // EPR marker column
              TEST_DATE_2025_01_15,
              '03 03 08',
              TEST_WEIGHT_100_5,
              10,
              5,
              85.5,
              'Yes',
              'Actual weight (100%)',
              5,
              0.95,
              81.225
            ]
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
    expect(savedRecords[0].rowId).toBe('10001')
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
          rows: [['some-value']]
        },
        RECEIVED_LOADS_FOR_REPROCESSING: {
          location: { sheet: 'Sheet1', row: 10, column: 'A' },
          headers: VALID_HEADERS,
          rows: [createValidRow({ ROW_ID: 10001 })]
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
    expect(savedRecords[0].rowId).toBe('10001')
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
          headers: VALID_HEADERS,
          rows: [
            createValidRow({ ROW_ID: 10001, GROSS_WEIGHT: TEST_WEIGHT_100_5 }),
            createValidRow({
              ROW_ID: 10002,
              DATE_RECEIVED_FOR_REPROCESSING: '2025-01-16',
              GROSS_WEIGHT: TEST_WEIGHT_200_75
            }),
            createValidRow({
              ROW_ID: 10003,
              DATE_RECEIVED_FOR_REPROCESSING: '2025-01-17',
              GROSS_WEIGHT: TEST_WEIGHT_250_5
            })
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

  it('filters out rows with validation errors', async () => {
    const fileId = 'test-file-with-errors'
    const summaryLog = {
      file: {
        id: fileId,
        uri: 's3://test-bucket/test-key-errors'
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
          headers: VALID_HEADERS,
          rows: [
            // Valid row
            createValidRow({ ROW_ID: 10001 }),
            // Invalid row - ROW_ID below minimum (9999 < 10000)
            createValidRow({ ROW_ID: 9999 }),
            // Valid row
            createValidRow({ ROW_ID: 10002 }),
            // Invalid row - missing required field (EWC_CODE is null)
            [10003, TEST_DATE_2025_01_15, null, 100, 10, 5, 85, 'Yes', 'Weight', 5, 0.95, 80]
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

    // Only valid rows should be saved
    const savedRecords = await wasteRecordRepository.findByRegistration(
      'org-1',
      'reg-1'
    )
    expect(savedRecords).toHaveLength(2)
    expect(savedRecords.map((r) => r.rowId).sort()).toEqual(['10001', '10002'])
  })

  it('throws error if fatal validation error occurs during submission', async () => {
    const fileId = 'test-file-fatal'
    const summaryLog = {
      file: {
        id: fileId,
        uri: 's3://test-bucket/test-key-fatal'
      },
      organisationId: 'org-1',
      registrationId: 'reg-1'
    }

    // Missing required header causes a FATAL error
    const parsedData = {
      meta: {
        PROCESSING_TYPE: {
          value: 'REPROCESSOR_INPUT'
        }
      },
      data: {
        RECEIVED_LOADS_FOR_REPROCESSING: {
          location: { sheet: 'Sheet1', row: 1, column: 'A' },
          headers: ['ROW_ID', 'DATE_RECEIVED_FOR_REPROCESSING'], // Missing required headers
          rows: [[10001, '2025-01-15']]
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

    await expect(sync(summaryLog)).rejects.toThrow(
      'Validation failed with fatal errors during submission'
    )

    // No records should be saved
    const savedRecords = await wasteRecordRepository.findByRegistration(
      'org-1',
      'reg-1'
    )
    expect(savedRecords).toHaveLength(0)
  })
})
