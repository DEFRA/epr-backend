import { describe, it, expect } from 'vitest'
import { compareSite, siteInfoToLog } from './site.js'

describe('compareSite', () => {
  it('returns true when both line1 and postcode match after normalization', () => {
    const site1 = {
      address: { line1: '78 Portland Place', postcode: 'W1B 1NT' }
    }
    const site2 = {
      address: { line1: '  78  PORTLAND  PLACE  ', postcode: '   W1b1NT  ' }
    }
    expect(compareSite(site1, site2)).toBe(true)
  })

  it('returns false when line1 or postcode differs', () => {
    const site = {
      address: { line1: '78 Portland Place', postcode: 'W1B 1NT' }
    }
    expect(
      compareSite(site, {
        address: { line1: '79 Portland Place', postcode: 'W1B 1NT' }
      })
    ).toBe(false)
    expect(
      compareSite(site, {
        address: { line1: '78 Portland Place', postcode: 'W1C 1NT' }
      })
    ).toBe(false)
  })

  it('returns false when any required field is missing', () => {
    const site = {
      address: { line1: '78 Portland Place', postcode: 'W1B 1NT' }
    }
    expect(compareSite(site, { address: { line1: '78 Portland Place' } })).toBe(
      false
    )
    expect(compareSite(site, { address: { postcode: 'W1B 1NT' } })).toBe(false)
    expect(compareSite(site, { address: {} })).toBe(false)
  })
})

describe('siteInfoToLog', () => {
  it('returns hashed line1 and postcode with consistent format', () => {
    const site = {
      address: { line1: '78 Portland Place', postcode: 'W1B 1NT' }
    }
    const result = siteInfoToLog(site)
    expect(result).toMatch(/^line1=[a-f0-9]{64}, postcode=[a-f0-9]{64}$/)
  })

  it('normalizes values before hashing', () => {
    const site1 = {
      address: { line1: '78 Portland Place', postcode: 'W1B 1NT' }
    }
    const site2 = {
      address: { line1: '  78  portland  place  ', postcode: '   W1b   1NT  ' }
    }
    expect(siteInfoToLog(site1)).toBe(siteInfoToLog(site2))
  })

  it('handles missing fields gracefully', () => {
    expect(siteInfoToLog({ address: {} })).toBe(
      'line1=undefined, postcode=undefined'
    )
    expect(
      siteInfoToLog({ address: { line1: '78 Portland Place' } })
    ).toContain('postcode=undefined')
  })
})
