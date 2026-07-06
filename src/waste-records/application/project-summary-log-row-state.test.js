import { describe, it, expect } from 'vitest'

import { projectSummaryLogRowState } from './project-summary-log-row-state.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { ROW_OUTCOME } from '#domain/summary-logs/table-schemas/validation-pipeline.js'

const overseasSites = /** @type {any} */ (new Map())

describe('projectSummaryLogRowState', () => {
  it('classifies the record and coerces its stored tonnages to two decimal places', () => {
    const record = {
      organisationId: 'org-1',
      registrationId: 'reg-1',
      rowId: '1',
      type: WASTE_RECORD_TYPE.RECEIVED,
      versions: [],
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
      classification: {
        outcome: ROW_OUTCOME.EXCLUDED,
        reasons: [],
        transactionAmount: 0
      },
      data: {
        processingType: 'REPROCESSOR_REGISTERED_ONLY',
        TONNAGE_RECEIVED_FOR_RECYCLING: 1.01,
        NET_WEIGHT: 7.54,
        supplierName: 'Acme'
      }
    })
  })

  it('stores a row state that reconciles by construction — NET equals GROSS minus TARE minus PALLET at 2dp', () => {
    const record = {
      organisationId: 'org-1',
      registrationId: 'reg-1',
      rowId: '3',
      type: WASTE_RECORD_TYPE.RECEIVED,
      versions: [],
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

  it('coerces a copy, leaving the source record data at full precision', () => {
    const record = {
      organisationId: 'org-1',
      registrationId: 'reg-1',
      rowId: '2',
      type: WASTE_RECORD_TYPE.RECEIVED,
      versions: [],
      data: { processingType: 'REPROCESSOR_REGISTERED_ONLY', NET_WEIGHT: 7.536 }
    }

    projectSummaryLogRowState(record, null, overseasSites)

    expect(record.data.NET_WEIGHT).toBe(7.536)
  })
})
