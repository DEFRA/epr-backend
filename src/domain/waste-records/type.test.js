import { describe, it, expect } from 'vitest'
import { WASTE_RECORD_TYPE } from './type.js'

describe('WASTE_RECORD_TYPE', () => {
  it('exports expected waste record types', () => {
    expect(WASTE_RECORD_TYPE).toEqual({
      RECEIVED: 'received',
      PROCESSED: 'processed',
      SENT_ON: 'sentOn',
      EXPORTED: 'exported'
    })
  })

  it('is frozen', () => {
    expect(Object.isFrozen(WASTE_RECORD_TYPE)).toBe(true)
  })
})
