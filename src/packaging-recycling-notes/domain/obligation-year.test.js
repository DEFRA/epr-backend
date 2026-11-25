import { toYear } from '#common/helpers/dates/year.js'
import { describe, expect, it } from 'vitest'

import {
  allowedObligationYears,
  InvalidObligationYearError,
  selectObligationYearForAcceptance
} from './obligation-year.js'

const buildPrn = ({ isDecemberWaste }) => ({
  isDecemberWaste,
  accreditation: { accreditationYear: toYear(2026) }
})

describe('obligation year', () => {
  describe('allowedObligationYears', () => {
    it.for([
      { isDecemberWaste: false, expected: [2026] },
      { isDecemberWaste: true, expected: [2026, 2027] }
    ])(
      'offers $expected when december waste is $isDecemberWaste',
      ({ isDecemberWaste, expected }) => {
        expect(
          allowedObligationYears(buildPrn({ isDecemberWaste }))
        ).toStrictEqual(expected)
      }
    )
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

    it('rejects any other obligation year for a December PRN, naming the allowed years', () => {
      const select = () =>
        selectObligationYearForAcceptance(
          buildPrn({ isDecemberWaste: true }),
          2028
        )

      expect(select).toThrow(InvalidObligationYearError)
      expect(select).toThrow(
        'obligationYear must be either accreditation year 2026 or 2027 for a December waste PRN; received 2028'
      )
    })
  })
})
