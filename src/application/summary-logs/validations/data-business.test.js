import { validateDataBusiness } from './data-business.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import { WASTE_BALANCE_OUTCOME } from '#waste-balances/domain/waste-balance-classification.js'

/** @import { ValidatedWasteRecord } from '#application/waste-records/transform-from-summary-log.js' */
/** @import { PreviousSubmission, WasteRecordState } from '#waste-records/application/read-summary-log-row-states.js' */

describe('validateDataBusiness', () => {
  /**
   * Creates a transformed record for testing
   * @param {Object} options
   * @param {string} options.rowId - The row ID
   * @param {string} [options.type] - The waste record type
   * @returns {ValidatedWasteRecord}
   */
  const createValidatedWasteRecord = ({
    rowId,
    type = WASTE_RECORD_TYPE.RECEIVED
  }) =>
    /** @type {ValidatedWasteRecord} */ (
      /** @type {unknown} */ ({
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
          versions: []
        },
        issues: []
      })
    )

  /**
   * @param {string} rowId
   * @returns {WasteRecordState}
   */
  const createWasteRecordState = (rowId) => ({
    rowId,
    wasteRecordType: WASTE_RECORD_TYPE.RECEIVED,
    processingType: PROCESSING_TYPES.REPROCESSOR_INPUT,
    data: {
      DATE_RECEIVED_FOR_REPROCESSING: '2024-01-15',
      GROSS_WEIGHT: 100
    },
    classification: {
      outcome: WASTE_BALANCE_OUTCOME.INCLUDED,
      reasons: [],
      transactionAmount: 100
    }
  })

  /**
   * @param {WasteRecordState[]} wasteRecordStates
   * @returns {PreviousSubmission}
   */
  const createPreviousSubmission = (wasteRecordStates) => ({
    summaryLog: {
      summaryLogId: 'previous-summary-log-id',
      submittedAt: new Date('2024-01-15T10:00:00.000Z')
    },
    wasteRecordStates
  })

  it('returns valid result when validators pass', () => {
    const result = validateDataBusiness({
      wasteRecords: [createValidatedWasteRecord({ rowId: 'row-1' })],
      previousSubmission: null
    })

    expect(result.isValid()).toBe(true)
    expect(result.isFatal()).toBe(false)
    expect(result.hasIssues()).toBe(false)
  })

  it('returns invalid result when validators fail', () => {
    const result = validateDataBusiness({
      wasteRecords: [createValidatedWasteRecord({ rowId: 'row-2' })],
      previousSubmission: createPreviousSubmission([
        createWasteRecordState('row-1'),
        createWasteRecordState('row-2')
      ])
    })

    expect(result.isValid()).toBe(false)
    expect(result.isFatal()).toBe(true)
    expect(result.hasIssues()).toBe(true)
  })
})
