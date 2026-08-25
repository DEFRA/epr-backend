import { describe, it, expect } from 'vitest'

import { projectSummaryLogRowState } from './project-summary-log-row-state.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'

/** @typedef {import('#domain/waste-records/model.js').WasteRecord} WasteRecord */
import { WASTE_BALANCE_OUTCOME } from '#waste-balances/domain/waste-balance-classification.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import { buildAccreditation } from '#repositories/organisations/contract/test-data.js'

const overseasSites = /** @type {any} */ (new Map())

const accreditation = buildAccreditation({
  validFrom: '2024-01-01',
  validTo: '2024-12-31',
  statusHistory: [
    { status: 'created', updatedAt: '2023-12-01T00:00:00.000Z' },
    { status: 'approved', updatedAt: '2023-12-15T00:00:00.000Z' }
  ]
})

describe('projectSummaryLogRowState', () => {
  it('classifies the record and coerces its stored tonnages to two decimal places', () => {
    /** @type {WasteRecord} */
    const record = {
      organisationId: 'org-1',
      registrationId: 'reg-1',
      rowId: '1',
      type: WASTE_RECORD_TYPE.RECEIVED,
      data: {
        processingType: 'REPROCESSOR_REGISTERED_ONLY',
        TONNAGE_RECEIVED_FOR_RECYCLING: 1.005,
        NET_WEIGHT: 7.536,
        supplierName: 'Acme'
      }
    }

    const projected = projectSummaryLogRowState(record, null, overseasSites)

    expect(projected).toMatchObject({
      rowId: '1',
      wasteRecordType: WASTE_RECORD_TYPE.RECEIVED,
      processingType: 'REPROCESSOR_REGISTERED_ONLY',
      classification: {
        outcome: WASTE_BALANCE_OUTCOME.NOT_APPLICABLE,
        reasons: [],
        transactionAmount: 0
      },
      data: {
        TONNAGE_RECEIVED_FOR_RECYCLING: 1.01,
        NET_WEIGHT: 7.54,
        supplierName: 'Acme'
      }
    })
  })

  it('hoists processingType to a top-level field, leaving it out of the stored data', () => {
    /** @type {WasteRecord} */
    const record = {
      organisationId: 'org-1',
      registrationId: 'reg-1',
      rowId: '1',
      type: WASTE_RECORD_TYPE.RECEIVED,
      data: {
        processingType: 'REPROCESSOR_REGISTERED_ONLY',
        supplierName: 'Acme'
      }
    }

    const projected = projectSummaryLogRowState(record, null, overseasSites)

    expect(projected.processingType).toBe('REPROCESSOR_REGISTERED_ONLY')
    expect(projected.data).not.toHaveProperty('processingType')
  })

  it('drops the redundant ROW_ID key from the stored data', () => {
    /** @type {WasteRecord} */
    const record = {
      organisationId: 'org-1',
      registrationId: 'reg-1',
      rowId: '1011',
      type: WASTE_RECORD_TYPE.RECEIVED,
      data: {
        processingType: 'REPROCESSOR_REGISTERED_ONLY',
        ROW_ID: 1011,
        supplierName: 'Acme'
      }
    }

    const projected = projectSummaryLogRowState(record, null, overseasSites)

    expect(projected.data).not.toHaveProperty('ROW_ID')
    expect(projected.rowId).toBe('1011')
  })

  it('stores a row state that reconciles by construction — NET equals GROSS minus TARE minus PALLET at 2dp', () => {
    /** @type {WasteRecord} */
    const record = {
      organisationId: 'org-1',
      registrationId: 'reg-1',
      rowId: '3',
      type: WASTE_RECORD_TYPE.RECEIVED,
      data: {
        processingType: 'REPROCESSOR_REGISTERED_ONLY',
        GROSS_WEIGHT: 10.004,
        TARE_WEIGHT: 0.005,
        PALLET_WEIGHT: 0,
        NET_WEIGHT: 9.999
      }
    }

    const { data } = projectSummaryLogRowState(record, null, overseasSites)

    expect(data.NET_WEIGHT).toBe(9.99)
    expect(data.NET_WEIGHT).toBe(
      data.GROSS_WEIGHT - data.TARE_WEIGHT - data.PALLET_WEIGHT
    )
  })

  it('projects a zero-tonnage sent-on debit as positive zero, not negative zero', () => {
    /** @type {WasteRecord} */
    const record = {
      organisationId: 'org-1',
      registrationId: 'reg-1',
      rowId: '5000',
      type: WASTE_RECORD_TYPE.SENT_ON,
      data: {
        processingType: PROCESSING_TYPES.REPROCESSOR_INPUT,
        DATE_LOAD_LEFT_SITE: new Date('2024-06-15'),
        TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON: 0
      }
    }

    const projected = projectSummaryLogRowState(
      record,
      accreditation,
      overseasSites
    )

    // A -0 debit does not survive the Mongo round-trip (it returns +0), so a
    // resubmission of the identical row would read as an endless phantom
    // adjustment. toBe uses Object.is, so -0 fails toBe(0).
    expect(projected.classification.outcome).toBe(
      WASTE_BALANCE_OUTCOME.INCLUDED
    )
    expect(projected.classification.transactionAmount).toBe(0)
    expect(Object.is(projected.classification.transactionAmount, -0)).toBe(
      false
    )
  })

  it('coerces a copy, leaving the source record data at full precision', () => {
    /** @type {WasteRecord} */
    const record = {
      organisationId: 'org-1',
      registrationId: 'reg-1',
      rowId: '2',
      type: WASTE_RECORD_TYPE.RECEIVED,
      data: { processingType: 'REPROCESSOR_REGISTERED_ONLY', NET_WEIGHT: 7.536 }
    }

    projectSummaryLogRowState(record, null, overseasSites)

    expect(record.data.NET_WEIGHT).toBe(7.536)
  })
})
