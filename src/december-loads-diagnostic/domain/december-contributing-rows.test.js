import { accreditationDecemberKey } from './december-contributing-rows.js'

describe('accreditationDecemberKey', () => {
  it('is the December of the accreditation validFrom year', () => {
    expect(accreditationDecemberKey({ validFrom: '2026-01-01' })).toBe(
      '2026-12'
    )
  })

  it('reads only the year, so any validFrom month resolves to that December', () => {
    expect(accreditationDecemberKey({ validFrom: '2025-07-15' })).toBe(
      '2025-12'
    )
  })

  it('is null when validFrom is absent', () => {
    expect(accreditationDecemberKey({})).toBeNull()
  })

  it('is null when validFrom is not a usable date string', () => {
    expect(accreditationDecemberKey({ validFrom: '26' })).toBeNull()
  })
})
