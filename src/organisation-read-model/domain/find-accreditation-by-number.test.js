import { toAccreditationNumber } from '#domain/organisations/numbers.js'
import { partialMock } from '#test/type-helpers.js'
import { findAccreditationByNumber } from './find-accreditation-by-number.js'

const ACC_2025 = toAccreditationNumber('ACC-2025')
const ACC_2026 = toAccreditationNumber('ACC-2026')

const registration = partialMock({
  accreditations: {
    2025: { accreditationNumber: ACC_2025 },
    2026: { accreditationNumber: ACC_2026 }
  }
})

describe('findAccreditationByNumber', () => {
  it('returns the accreditation with its year key for a matching number', () => {
    expect(findAccreditationByNumber(registration, ACC_2026)).toEqual({
      year: '2026',
      accreditation: { accreditationNumber: ACC_2026 }
    })
  })

  it('returns null when no accreditation has the number', () => {
    expect(
      findAccreditationByNumber(registration, toAccreditationNumber('NOPE'))
    ).toBeNull()
  })

  it('returns null when the registration has no accreditations', () => {
    expect(
      findAccreditationByNumber(partialMock({ accreditations: {} }), ACC_2025)
    ).toBeNull()
  })
})
