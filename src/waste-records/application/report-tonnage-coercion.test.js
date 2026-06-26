import { describe, it, expect } from 'vitest'

import {
  REPORT_FACING_TONNAGE_FIELDS,
  coerceReportTonnages
} from './report-tonnage-coercion.js'

describe('coerceReportTonnages', () => {
  it('rounds each report-facing tonnage field to two decimal places, half-up', () => {
    const data = {
      TONNAGE_RECEIVED_FOR_RECYCLING: 1.005,
      TONNAGE_RECEIVED_FOR_EXPORT: 2.344,
      TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: 3.005,
      TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON: 4.999
    }

    expect(coerceReportTonnages(data)).toEqual({
      TONNAGE_RECEIVED_FOR_RECYCLING: 1.01,
      TONNAGE_RECEIVED_FOR_EXPORT: 2.34,
      TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: 3.01,
      TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON: 5
    })
  })

  it('leaves non-tonnage fields untouched', () => {
    const data = {
      supplierName: 'Acme',
      NET_WEIGHT: 12.3456,
      TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON: 7.891
    }

    expect(coerceReportTonnages(data)).toEqual({
      supplierName: 'Acme',
      NET_WEIGHT: 12.3456,
      TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON: 7.89
    })
  })

  it('skips tonnage fields that are absent or not numeric', () => {
    const data = {
      TONNAGE_RECEIVED_FOR_EXPORT: 'not-a-number',
      supplierName: 'Beta'
    }

    expect(coerceReportTonnages(data)).toEqual({
      TONNAGE_RECEIVED_FOR_EXPORT: 'not-a-number',
      supplierName: 'Beta'
    })
  })

  it('returns a new object without mutating the input', () => {
    const data = { TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: 1.239 }
    const result = coerceReportTonnages(data)

    expect(result).not.toBe(data)
    expect(data.TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED).toBe(1.239)
  })

  it('names the four report-facing tonnage fields the report aggregation sums', () => {
    expect([...REPORT_FACING_TONNAGE_FIELDS]).toEqual([
      'TONNAGE_RECEIVED_FOR_RECYCLING',
      'TONNAGE_RECEIVED_FOR_EXPORT',
      'TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED',
      'TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON'
    ])
  })
})
