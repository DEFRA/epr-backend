import { validateDataBusiness } from './data-business.js'
import {
  VERSION_STATUS,
  WASTE_RECORD_TYPE
} from '#domain/waste-records/model.js'

describe('validateDataBusiness', () => {
  /**
   * Creates a transformed record for testing
   * @param {Object} options
   * @param {string} options.rowId - The row ID
   * @param {string} [options.type] - The waste record type
   * @param {Array} [options.issues] - Validation issues
   * @returns {{ record: Object, issues: Array }}
   */
  const createValidatedWasteRecord = ({
    rowId,
    type = WASTE_RECORD_TYPE.RECEIVED,
    issues = []
  }) => ({
    record: {
      organisationId: 'org-456',
      registrationId: 'reg-789',
      accreditationId: 'acc-111',
      rowId,
      type,
      data: {
        ROW_ID: rowId,
        DATE_RECEIVED_FOR_REPROCESSING: '2024-01-15',
        GROSS_WEIGHT: 100
      },
      versions: [
        {
          createdAt: new Date().toISOString(),
          status: VERSION_STATUS.CREATED,
          summaryLog: {
            id: 'current-summary-log-id',
            uri: 's3://bucket/current-file.xlsx'
          },
          data: {
            ROW_ID: rowId,
            DATE_RECEIVED_FOR_REPROCESSING: '2024-01-15',
            GROSS_WEIGHT: 100
          }
        }
      ]
    },
    issues
  })

  /**
   * Creates an existing waste record for testing
   * @param {string} rowId - The row ID
   * @returns {Object} Waste record
   */
  const createWasteRecord = (rowId) => ({
    organisationId: 'org-456',
    registrationId: 'reg-789',
    accreditationId: 'acc-111',
    rowId,
    type: WASTE_RECORD_TYPE.RECEIVED,
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
    const wasteRecords = [createValidatedWasteRecord({ rowId: 'row-1' })]
    const existingWasteRecords = []

    const result = validateDataBusiness({
      wasteRecords,
      existingWasteRecords
    })

    expect(result.isValid()).toBe(true)
    expect(result.isFatal()).toBe(false)
    expect(result.hasIssues()).toBe(false)
  })

  it('returns invalid result when validators fail', () => {
    const wasteRecords = [
      createValidatedWasteRecord({ rowId: 'row-2' }) // row-1 is missing
    ]
    const existingWasteRecords = [
      createWasteRecord('row-1'),
      createWasteRecord('row-2')
    ]

    const result = validateDataBusiness({
      wasteRecords,
      existingWasteRecords
    })

    expect(result.isValid()).toBe(false)
    expect(result.isFatal()).toBe(true)
    expect(result.hasIssues()).toBe(true)
  })
})
