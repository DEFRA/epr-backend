import { describe, it, expect } from 'vitest'

import {
  STORED_TONNAGE_FIELDS,
  coerceStoredTonnages
} from './stored-tonnage-coercion.js'

describe('coerceStoredTonnages', () => {
  it('rounds every stored tonnage/weight field to two decimal places, half-up', () => {
    const data = {
      GROSS_WEIGHT: 10.005,
      TARE_WEIGHT: 2.344,
      PALLET_WEIGHT: 0.125,
      NET_WEIGHT: 7.536,
      WEIGHT_OF_NON_TARGET_MATERIALS: 0.014,
      TONNAGE_RECEIVED_FOR_RECYCLING: 1.005,
      TONNAGE_RECEIVED_FOR_EXPORT: 2.344,
      TONNAGE_PASSED_INTERIM_SITE_RECEIVED_BY_OSR: 3.995,
      TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: 3.005,
      TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON: 4.999,
      PRODUCT_TONNAGE: 5.675,
      PRODUCT_UK_PACKAGING_WEIGHT_PROPORTION: 6.001
    }

    expect(coerceStoredTonnages(data)).toEqual({
      GROSS_WEIGHT: 10.01,
      TARE_WEIGHT: 2.34,
      PALLET_WEIGHT: 0.13,
      NET_WEIGHT: 7.54,
      WEIGHT_OF_NON_TARGET_MATERIALS: 0.01,
      TONNAGE_RECEIVED_FOR_RECYCLING: 1.01,
      TONNAGE_RECEIVED_FOR_EXPORT: 2.34,
      TONNAGE_PASSED_INTERIM_SITE_RECEIVED_BY_OSR: 4,
      TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: 3.01,
      TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON: 5,
      PRODUCT_TONNAGE: 5.68,
      PRODUCT_UK_PACKAGING_WEIGHT_PROPORTION: 6
    })
  })

  it('leaves non-tonnage fields untouched', () => {
    const data = {
      supplierName: 'Acme',
      INTERIM_SITE_ID: 'site-1',
      TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON: 7.891
    }

    expect(coerceStoredTonnages(data)).toEqual({
      supplierName: 'Acme',
      INTERIM_SITE_ID: 'site-1',
      TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON: 7.89
    })
  })

  it('skips tonnage fields that are absent or not numeric', () => {
    const data = {
      TONNAGE_RECEIVED_FOR_EXPORT: 'not-a-number',
      supplierName: 'Beta'
    }

    expect(coerceStoredTonnages(data)).toEqual({
      TONNAGE_RECEIVED_FOR_EXPORT: 'not-a-number',
      supplierName: 'Beta'
    })
  })

  it('returns a new object without mutating the input', () => {
    const data = { TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: 1.239 }
    const result = coerceStoredTonnages(data)

    expect(result).not.toBe(data)
    expect(data.TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED).toBe(1.239)
  })

  it('names the twelve stored tonnage/weight fields, transactionAmount excluded', () => {
    expect([...STORED_TONNAGE_FIELDS]).toEqual([
      'GROSS_WEIGHT',
      'TARE_WEIGHT',
      'PALLET_WEIGHT',
      'NET_WEIGHT',
      'WEIGHT_OF_NON_TARGET_MATERIALS',
      'TONNAGE_RECEIVED_FOR_RECYCLING',
      'TONNAGE_RECEIVED_FOR_EXPORT',
      'TONNAGE_PASSED_INTERIM_SITE_RECEIVED_BY_OSR',
      'TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED',
      'TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON',
      'PRODUCT_TONNAGE',
      'PRODUCT_UK_PACKAGING_WEIGHT_PROPORTION'
    ])
  })

  it('stores interim-site tonnages so round-each-then-sum no longer drifts from sum-then-round', () => {
    const stored = [3.995, 3.995, 3.995]
      .map((tonnage) =>
        coerceStoredTonnages({
          TONNAGE_PASSED_INTERIM_SITE_RECEIVED_BY_OSR: tonnage
        })
      )
      .map((row) => row.TONNAGE_PASSED_INTERIM_SITE_RECEIVED_BY_OSR)

    // Each row stored at 2dp (4.00), so the tonnage-monitoring aggregation sums
    // 12.00 however it adds them — the sum-then-round residual (11.985 → 11.99)
    // can no longer arise.
    expect(stored).toEqual([4, 4, 4])
    expect(stored.reduce((sum, t) => sum + t, 0)).toBeCloseTo(12, 10)
  })

  it('derives stored NET_WEIGHT from the coerced components so the row reconciles by construction', () => {
    // Counterexample where independent per-field rounding would break the
    // stored identity: GROSS=10.004 TARE=0.005 PALLET=0 NET=9.999 passes ingest
    // (9.999 == 10.004 - 0.005 within tolerance), but rounding each field alone
    // gives GROSS=10.00, TARE=0.01, NET=10.00 — a stored row where
    // GROSS - TARE - PALLET = 9.99 ≠ NET = 10.00. Deriving NET from the coerced
    // components restores the identity at 2dp.
    const coerced = coerceStoredTonnages({
      GROSS_WEIGHT: 10.004,
      TARE_WEIGHT: 0.005,
      PALLET_WEIGHT: 0,
      NET_WEIGHT: 9.999
    })

    expect(coerced.GROSS_WEIGHT).toBe(10)
    expect(coerced.TARE_WEIGHT).toBe(0.01)
    expect(coerced.NET_WEIGHT).toBe(9.99)
    expect(coerced.NET_WEIGHT).toBe(
      coerced.GROSS_WEIGHT - coerced.TARE_WEIGHT - coerced.PALLET_WEIGHT
    )
  })

  it('leaves NET_WEIGHT independently rounded when a weight component is absent', () => {
    const coerced = coerceStoredTonnages({
      GROSS_WEIGHT: 10.005,
      NET_WEIGHT: 7.002
    })

    // Without all of GROSS/TARE/PALLET the ingest identity does not apply, so
    // NET keeps its own single rounding rather than being derived.
    expect(coerced.NET_WEIGHT).toBe(7)
    expect(coerced.GROSS_WEIGHT).toBe(10.01)
  })
})
