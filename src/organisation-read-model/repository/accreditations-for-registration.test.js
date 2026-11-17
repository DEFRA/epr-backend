import { accreditationsForRegistration } from './accreditations-for-registration.js'

/** @import { Accreditation } from '#domain/organisations/accreditation.js' */

/** @type {Accreditation} */
const accreditation = /** @type {Accreditation} */ (
  /** @type {unknown} */ ({
    id: 'acc-1',
    accreditationNumber: 'ACC-001',
    status: 'approved',
    statusHistory: [],
    validFrom: '2026-01-01',
    validTo: '2026-12-31',
    material: 'plastic',
    wasteProcessingType: 'reprocessor'
  })
)

const org = { accreditations: [accreditation] }

describe('accreditationsForRegistration', () => {
  it('returns the accreditation the registration names', () => {
    expect(
      accreditationsForRegistration({ accreditationId: 'acc-1' }, org)
    ).toEqual([accreditation])
  })

  it('returns an empty list when the registration names no accreditation', () => {
    expect(
      accreditationsForRegistration({ accreditationId: null }, org)
    ).toEqual([])
  })

  it('returns an empty list when the organisation holds no accreditation of that id', () => {
    expect(
      accreditationsForRegistration({ accreditationId: 'acc-9' }, org)
    ).toEqual([])
  })
})
