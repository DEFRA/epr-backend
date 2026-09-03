import { describe, expect, it } from 'vitest'

import {
  InvalidObligationYearError,
  selectObligationYearForAcceptance
} from './obligation-year.js'

const buildPrn = ({ isDecemberWaste }) => ({
  isDecemberWaste,
  accreditation: { accreditationYear: 2026 }
})

describe('selectObligationYearForAcceptance', () => {
  it('leaves the obligation year unchanged when none is supplied', () => {
    expect(
      selectObligationYearForAcceptance(buildPrn({ isDecemberWaste: true }))
    ).toBeUndefined()
  })

  it('leaves the obligation year unchanged for a non-December PRN', () => {
    expect(
      selectObligationYearForAcceptance(
        buildPrn({ isDecemberWaste: false }),
        2027
      )
    ).toBeUndefined()
  })

  it.each([2026, 2027])(
    'allows a December PRN to use obligation year %i',
    (obligationYear) => {
      expect(
        selectObligationYearForAcceptance(
          buildPrn({ isDecemberWaste: true }),
          obligationYear
        )
      ).toBe(obligationYear)
    }
  )

  it('rejects any other obligation year for a December PRN', () => {
    expect(() =>
      selectObligationYearForAcceptance(
        buildPrn({ isDecemberWaste: true }),
        2028
      )
    ).toThrow(InvalidObligationYearError)
  })
})
