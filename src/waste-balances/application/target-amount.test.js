import { describe, it, expect } from 'vitest'

import { getTargetAmount } from './target-amount.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'

const accreditation = { id: 'acc-1' }
const overseasSites = /** @type {*} */ (new Map())

describe('getTargetAmount', () => {
  it('contributes zero for a record excluded from the waste balance', () => {
    const record = /** @type {*} */ ({
      type: 'unknown-type',
      data: { processingType: PROCESSING_TYPES.EXPORTER },
      excludedFromWasteBalance: true
    })

    expect(getTargetAmount(record, accreditation, overseasSites)).toBe(0)
  })

  it('contributes zero when no schema classifies the record type', () => {
    const record = /** @type {*} */ ({
      type: 'unknown-type',
      data: { processingType: PROCESSING_TYPES.EXPORTER },
      excludedFromWasteBalance: false
    })

    expect(getTargetAmount(record, accreditation, overseasSites)).toBe(0)
  })
})
