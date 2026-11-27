import { describe, expect, it } from 'vitest'

import { STORED_TONNAGE_FIELDS } from './stored-tonnage-fields.js'

describe('STORED_TONNAGE_FIELDS', () => {
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
})
