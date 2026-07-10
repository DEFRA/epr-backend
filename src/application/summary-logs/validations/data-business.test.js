import { validateDataBusiness } from './data-business.js'
import {
  WASTE_RECORD_CHANGE,
  WASTE_RECORD_TYPE
} from '#domain/waste-records/model.js'
import { ROW_OUTCOME } from '#domain/summary-logs/table-schemas/validation-pipeline.js'
import { WASTE_BALANCE_OUTCOME } from '#waste-balances/domain/waste-balance-classification.js'

/** @import {ValidatedWasteRecord} from '#application/waste-records/transform-from-summary-log.js' */
/** @import {PreviousSubmission} from '#waste-records/application/read-summary-log-row-states.js' */

describe('validateDataBusiness', () => {
  /**
   * A transformed record from the upload under validation
   *
   * @param {{ rowId: string }} options
   * @returns {ValidatedWasteRecord}
   */
  const createValidatedWasteRecord = ({ rowId }) => ({
    record: {
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
      versions: []
    },
    issues: [],
    outcome: ROW_OUTCOME.INCLUDED,
    change: WASTE_RECORD_CHANGE.CREATED,
    tableName: 'RECEIVED_LOADS_FOR_REPROCESSING',
    wasteRecordType: WASTE_RECORD_TYPE.RECEIVED
  })

  /**
   * @param {string[]} rowIds
   * @returns {PreviousSubmission}
   */
  const createPreviousSubmission = (rowIds) => ({
    summaryLog: {
      summaryLogId: 'previous-summary-log-id',
      submittedAt: new Date('2024-01-15T10:00:00.000Z')
    },
    wasteRecordStates: rowIds.map((rowId) => ({
      rowId,
      wasteRecordType: WASTE_RECORD_TYPE.RECEIVED,
      data: { GROSS_WEIGHT: 100 },
      classification: {
        outcome: WASTE_BALANCE_OUTCOME.INCLUDED,
        reasons: [],
        transactionAmount: 100
      }
    }))
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
      previousSubmission: createPreviousSubmission(['row-1', 'row-2'])
    })

    expect(result.isValid()).toBe(false)
    expect(result.isFatal()).toBe(true)
    expect(result.hasIssues()).toBe(true)
  })
})
