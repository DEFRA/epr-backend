import { describe, it, expect } from 'vitest'
import { transformFromSummaryLog } from './transform-from-summary-log.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'

const FIRST_ROW_ID = 'row-123'
const FIRST_DATE = '2025-01-15'
const FIRST_WEIGHT = 100.5
const SECOND_WEIGHT = 200.75

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
    /** @type {any} */ const parsedData = {
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

    const result = transformFromSummaryLog(parsedData, {
      organisationId: 'org-1',
      registrationId: 'reg-1'
    })

    expect(result).toHaveLength(2)
    expectValidWasteRecord(result[0], FIRST_ROW_ID, FIRST_DATE, FIRST_WEIGHT)
    expectValidWasteRecord(result[1], 'row-456', '2025-01-16', SECOND_WEIGHT)
  })

  it('transforms rows into records without version history', () => {
    /** @type {any} */ const parsedData = {
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

    const result = transformFromSummaryLog(parsedData, {
      organisationId: 'org-1',
      registrationId: 'reg-1'
    })

    expect(result[0].record).not.toHaveProperty('versions')
    expect(result[0]).not.toHaveProperty('change')
  })

  it('returns empty array when no RECEIVED_LOADS data present', () => {
    /** @type {any} */ const parsedData = {
      meta: {
        PROCESSING_TYPE: {
          value: 'REPROCESSOR_INPUT'
        }
      },
      data: {}
    }

    const result = transformFromSummaryLog(parsedData, {
      organisationId: 'org-1',
      registrationId: 'reg-1'
    })

    expect(result).toEqual([])
  })

  it('includes optional accreditationId when provided', () => {
    const headers = ['ROW_ID', 'DATE_RECEIVED_FOR_REPROCESSING']
    /** @type {any} */ const parsedData = {
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

    const result = transformFromSummaryLog(parsedData, {
      organisationId: 'org-1',
      registrationId: 'reg-1',
      accreditationId: 'acc-1'
    })

    expect(result[0].record.accreditationId).toBe('acc-1')
  })

  it('omits accreditationId when not provided', () => {
    /** @type {any} */ const parsedData = {
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

    const result = transformFromSummaryLog(parsedData, {
      organisationId: 'org-1',
      registrationId: 'reg-1'
    })

    expect(result[0].record).not.toHaveProperty('accreditationId')
  })

  it('throws error for unknown processing type', () => {
    /** @type {any} */ const parsedData = {
      meta: {
        PROCESSING_TYPE: {
          value: 'UNKNOWN_TYPE'
        }
      },
      data: {}
    }

    expect(() =>
      transformFromSummaryLog(parsedData, {
        organisationId: 'org-1',
        registrationId: 'reg-1'
      })
    ).toThrow('Unknown PROCESSING_TYPE: UNKNOWN_TYPE')
  })

  it('returns empty array when no processing type is specified', () => {
    /** @type {any} */ const parsedData = {
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

    const result = transformFromSummaryLog(parsedData, {
      organisationId: 'org-1',
      registrationId: 'reg-1'
    })

    expect(result).toEqual([])
  })

  describe('REPROCESSOR_INPUT.REPROCESSED_LOADS', () => {
    const REPROCESSED_LOADS_HEADERS = [
      'ROW_ID',
      'DATE_LOAD_LEFT_SITE',
      'PRODUCT_DESCRIPTION',
      'PRODUCT_TONNAGE'
    ]

    it('transforms REPROCESSED_LOADS data for REPROCESSOR_INPUT into waste records', () => {
      /** @type {any} */ const parsedData = {
        meta: {
          PROCESSING_TYPE: {
            value: 'REPROCESSOR_INPUT'
          }
        },
        data: {
          REPROCESSED_LOADS: {
            location: { sheet: 'Sheet1', row: 1, column: 'A' },
            headers: REPROCESSED_LOADS_HEADERS,
            rows: [
              createRow(
                REPROCESSED_LOADS_HEADERS,
                ['row-4001', '2025-01-15', 'Recycled plastic pellets', 1500],
                'row-4001'
              )
            ]
          }
        }
      }

      const result = transformFromSummaryLog(parsedData, {
        organisationId: 'org-1',
        registrationId: 'reg-1'
      })

      expect(result).toHaveLength(1)
      const { record } = result[0]
      expect(record).toMatchObject({
        organisationId: 'org-1',
        registrationId: 'reg-1',
        rowId: 'row-4001',
        type: WASTE_RECORD_TYPE.PROCESSED,
        data: {
          ROW_ID: 'row-4001',
          DATE_LOAD_LEFT_SITE: '2025-01-15',
          PRODUCT_DESCRIPTION: 'Recycled plastic pellets',
          PRODUCT_TONNAGE: 1500,
          processingType: 'REPROCESSOR_INPUT'
        }
      })
    })
  })

  describe('EXPORTER_REGISTERED_ONLY.RECEIVED_LOADS_FOR_EXPORT', () => {
    const RECEIVED_FOR_EXPORT_HEADERS = [
      'ROW_ID',
      'MONTH_RECEIVED_FOR_EXPORT',
      'NET_WEIGHT'
    ]

    it('slices the month value to year-month granularity', () => {
      /** @type {any} */ const parsedData = {
        meta: {
          PROCESSING_TYPE: {
            value: 'EXPORTER_REGISTERED_ONLY'
          }
        },
        data: {
          RECEIVED_LOADS_FOR_EXPORT: {
            location: { sheet: 'Sheet1', row: 1, column: 'A' },
            headers: RECEIVED_FOR_EXPORT_HEADERS,
            rows: [
              createRow(
                RECEIVED_FOR_EXPORT_HEADERS,
                ['5001', '2026-03-01', 10.5],
                '5001'
              )
            ]
          }
        }
      }

      const result = transformFromSummaryLog(parsedData, {
        organisationId: 'org-1',
        registrationId: 'reg-1'
      })

      expect(result[0].record.data.MONTH_RECEIVED_FOR_EXPORT).toBe('2026-03')
    })
  })

  describe('EXPORTER.SENT_ON_LOADS', () => {
    const SENT_ON_LOADS_HEADERS = [
      'ROW_ID',
      'DATE_LOAD_LEFT_SITE',
      'TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON',
      'FINAL_DESTINATION_NAME'
    ]

    it('transforms SENT_ON_LOADS data for EXPORTER into waste records', () => {
      /** @type {any} */ const parsedData = {
        meta: {
          PROCESSING_TYPE: {
            value: 'EXPORTER'
          }
        },
        data: {
          SENT_ON_LOADS: {
            location: { sheet: 'Sheet1', row: 1, column: 'A' },
            headers: SENT_ON_LOADS_HEADERS,
            rows: [
              createRow(
                SENT_ON_LOADS_HEADERS,
                ['row-4001', '2025-01-15', 500, 'Green Recycling Ltd'],
                'row-4001'
              )
            ]
          }
        }
      }

      const result = transformFromSummaryLog(parsedData, {
        organisationId: 'org-1',
        registrationId: 'reg-1'
      })

      expect(result).toHaveLength(1)
      const { record } = result[0]
      expect(record).toMatchObject({
        organisationId: 'org-1',
        registrationId: 'reg-1',
        rowId: 'row-4001',
        type: WASTE_RECORD_TYPE.SENT_ON,
        data: {
          ROW_ID: 'row-4001',
          DATE_LOAD_LEFT_SITE: '2025-01-15',
          TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON: 500,
          FINAL_DESTINATION_NAME: 'Green Recycling Ltd',
          processingType: 'EXPORTER'
        }
      })
    })
  })
})

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
}
