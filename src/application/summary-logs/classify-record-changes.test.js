import { describe, it, expect } from 'vitest'

import { classifyRecordChanges } from './classify-record-changes.js'
import { RECORD_CHANGE } from './record-change.js'
import { projectSummaryLogRowState } from '#waste-records/application/project-summary-log-row-state.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { WASTE_BALANCE_OUTCOME } from '#waste-balances/domain/waste-balance-classification.js'

const overseasSites = /** @type {any} */ (new Map())

/**
 * @param {Record<string, any>} data
 * @param {{ rowId?: string, type?: string }} [ids]
 */
const buildWasteRecord = (
  data,
  { rowId = '1', type = WASTE_RECORD_TYPE.RECEIVED } = {}
) =>
  /** @type {any} */ ({
    record: {
      type,
      rowId,
      data: { processingType: 'REPROCESSOR_REGISTERED_ONLY', ...data }
    }
  })

/**
 * A submitted row state as the read model projects it — the write-path
 * projection minus the storage-only processingType/id fields.
 * @param {import('#domain/waste-records/model.js').WasteRecord} record
 */
const submittedStateOf = (record) => {
  const { rowId, wasteRecordType, data, classification } =
    projectSummaryLogRowState(record, null, overseasSites)
  return { rowId, wasteRecordType, data, classification }
}

const key = (record) => `${record.type}:${record.rowId}`

describe('classifyRecordChanges', () => {
  it('classifies a row with no submitted row state as added', () => {
    const wasteRecord = buildWasteRecord({ supplierName: 'Acme' })

    const changes = classifyRecordChanges({
      wasteRecords: [wasteRecord],
      submittedRowStatesByKey: new Map(),
      accreditation: null,
      overseasSites
    })

    expect(changes.get(key(wasteRecord.record))).toBe(RECORD_CHANGE.ADDED)
  })

  it('classifies a row whose projected content and reading match the submitted state as unchanged', () => {
    const wasteRecord = buildWasteRecord({
      supplierName: 'Acme',
      TONNAGE_RECEIVED_FOR_RECYCLING: 10
    })
    const submittedRowStatesByKey = new Map([
      [key(wasteRecord.record), submittedStateOf(wasteRecord.record)]
    ])

    const changes = classifyRecordChanges({
      wasteRecords: [wasteRecord],
      submittedRowStatesByKey,
      accreditation: null,
      overseasSites
    })

    expect(changes.get(key(wasteRecord.record))).toBe(RECORD_CHANGE.UNCHANGED)
  })

  it('classifies a row whose content differs from the submitted state as adjusted', () => {
    const submittedRecord = buildWasteRecord({
      supplierName: 'Acme',
      TONNAGE_RECEIVED_FOR_RECYCLING: 20
    })
    const currentRecord = buildWasteRecord({
      supplierName: 'Acme',
      TONNAGE_RECEIVED_FOR_RECYCLING: 10
    })
    const submittedRowStatesByKey = new Map([
      [key(submittedRecord.record), submittedStateOf(submittedRecord.record)]
    ])

    const changes = classifyRecordChanges({
      wasteRecords: [currentRecord],
      submittedRowStatesByKey,
      accreditation: null,
      overseasSites
    })

    expect(changes.get(key(currentRecord.record))).toBe(RECORD_CHANGE.ADJUSTED)
  })

  it('classifies a row whose content matches but whose submitted reading differs as adjusted', () => {
    const wasteRecord = buildWasteRecord({
      supplierName: 'Acme',
      TONNAGE_RECEIVED_FOR_RECYCLING: 10
    })
    const submitted = submittedStateOf(wasteRecord.record)
    const submittedRowStatesByKey = new Map([
      [
        key(wasteRecord.record),
        {
          ...submitted,
          classification: {
            outcome: WASTE_BALANCE_OUTCOME.INCLUDED,
            reasons: [],
            transactionAmount: 10
          }
        }
      ]
    ])

    const changes = classifyRecordChanges({
      wasteRecords: [wasteRecord],
      submittedRowStatesByKey,
      accreditation: null,
      overseasSites
    })

    expect(changes.get(key(wasteRecord.record))).toBe(RECORD_CHANGE.ADJUSTED)
  })

  it('coerces the current row before comparing, so a sub-penny difference the store rounds away reads as unchanged', () => {
    const submittedRecord = buildWasteRecord({ NET_WEIGHT: 7.54 })
    const currentRecord = buildWasteRecord({ NET_WEIGHT: 7.536 })
    const submittedRowStatesByKey = new Map([
      [key(submittedRecord.record), submittedStateOf(submittedRecord.record)]
    ])

    const changes = classifyRecordChanges({
      wasteRecords: [currentRecord],
      submittedRowStatesByKey,
      accreditation: null,
      overseasSites
    })

    expect(changes.get(key(currentRecord.record))).toBe(RECORD_CHANGE.UNCHANGED)
  })
})
