import { describe, expect, it } from 'vitest'

import { toYear } from '#common/helpers/dates/year.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'

import { summariseIncompleteData } from './assert-report-data-complete.js'

const receivedWithoutSupplier = {
  rowId: '1001',
  processingType: PROCESSING_TYPES.REPROCESSOR_REGISTERED_ONLY,
  wasteRecordType: WASTE_RECORD_TYPE.RECEIVED,
  data: { TONNAGE_RECEIVED_FOR_RECYCLING: 5 }
}

describe('summariseIncompleteData', () => {
  it.each([2026, 2027])('reads the table schema for a %s report', (year) => {
    expect(
      summariseIncompleteData([receivedWithoutSupplier], toYear(year))
    ).toMatchObject({
      total: 6,
      issues: expect.arrayContaining([
        { sheet: 'Received', rowId: '1001', field: 'SUPPLIER_NAME' }
      ])
    })
  })

  it('fails for a year with no template', () => {
    expect(() =>
      summariseIncompleteData([receivedWithoutSupplier], toYear(2028))
    ).toThrow('No REPROCESSOR_REGISTERED_ONLY summary log template for 2028')
  })

  it('reads no template when there are no rows', () => {
    expect(summariseIncompleteData([], toYear(2028))).toBeNull()
  })
})
