import { describe, it, expect } from 'vitest'

import { projectRowState } from './project-row-state.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { ROW_OUTCOME } from '#domain/summary-logs/table-schemas/validation-pipeline.js'

const overseasSites = /** @type {any} */ (new Map())

describe('projectRowState', () => {
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

    const projected = projectRowState(record, null, overseasSites)

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

  it('coerces a copy, leaving the source record data at full precision', () => {
    const record = {
      organisationId: 'org-1',
      registrationId: 'reg-1',
      rowId: '2',
      type: WASTE_RECORD_TYPE.RECEIVED,
      versions: [],
      data: { processingType: 'REPROCESSOR_REGISTERED_ONLY', NET_WEIGHT: 7.536 }
    }

    projectRowState(record, null, overseasSites)

    expect(record.data.NET_WEIGHT).toBe(7.536)
  })
})
