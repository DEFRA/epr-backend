import { validateDataBusiness } from './data-business.js'
import { VERSION_STATUS } from '#domain/waste-records/model.js'

describe('validateDataBusiness', () => {
  const createSummaryLog = (overrides = {}) => ({
    id: 'summary-log-123',
    organisationId: 'org-456',
    registrationId: 'reg-789',
    accreditationId: 'acc-111',
    file: {
      uri: 's3://bucket/file.xlsx'
    },
    ...overrides
  })

  const createParsedData = (rows = []) => ({
    meta: {
      PROCESSING_TYPE: { value: 'REPROCESSOR_INPUT' }
    },
    data: {
      RECEIVED_LOADS_FOR_REPROCESSING: {
        location: { sheet: 'Received', row: 1, column: 'A' },
        headers: ['ROW_ID', 'DATE_RECEIVED_FOR_REPROCESSING', 'GROSS_WEIGHT'],
        rows
      }
    }
  })

  const createWasteRecord = (rowId) => ({
    organisationId: 'org-456',
    registrationId: 'reg-789',
    accreditationId: 'acc-111',
    rowId,
    type: 'received',
    data: {
      ROW_ID: rowId,
      DATE_RECEIVED_FOR_REPROCESSING: '2024-01-15',
      GROSS_WEIGHT: 100
    },
    versions: [
      {
        createdAt: '2024-01-15T10:00:00.000Z',
        status: VERSION_STATUS.CREATED,
        summaryLog: {
          id: 'previous-summary-log-id',
          uri: 's3://bucket/previous-file.xlsx'
        },
        data: {
          ROW_ID: rowId,
          DATE_RECEIVED_FOR_REPROCESSING: '2024-01-15',
          GROSS_WEIGHT: 100
        }
      }
    ]
  })

  it('returns valid result when validators pass', () => {
    const summaryLog = createSummaryLog()
    const parsed = createParsedData([['row-1', '2024-01-15', 100]])
    const existingWasteRecords = []

    const result = validateDataBusiness({
      parsed,
      summaryLog,
      existingWasteRecords
    })

    expect(result.isValid()).toBe(true)
    expect(result.isFatal()).toBe(false)
    expect(result.hasIssues()).toBe(false)
  })

  it('returns invalid result when validators fail', () => {
    const summaryLog = createSummaryLog()
    const parsed = createParsedData([
      ['row-2', '2024-01-15', 200] // row-1 is missing
    ])
    const existingWasteRecords = [
      createWasteRecord('row-1'),
      createWasteRecord('row-2')
    ]

    const result = validateDataBusiness({
      parsed,
      summaryLog,
      existingWasteRecords
    })

    expect(result.isValid()).toBe(false)
    expect(result.isFatal()).toBe(true)
    expect(result.hasIssues()).toBe(true)
  })
})
