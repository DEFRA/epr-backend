import { describe, expect, it } from 'vitest'

import { numbersFor, toOrganisationNumber } from './numbers.js'

/** @import {Organisation} from '#domain/organisations/model.js' */

describe('toOrganisationNumber', () => {
  it('accepts a positive whole number', () => {
    expect(toOrganisationNumber('500001')).toBe('500001')
  })

  it.each(['', '0', '0500001', '-1', '5000.1', ' 500001', 'abc'])(
    'rejects %j',
    (value) => {
      expect(() => toOrganisationNumber(value)).toThrow(
        `'${value}' is not an organisation number`
      )
    }
  )
})

/** @returns {Organisation} */
const buildOrganisation = () =>
  /** @type {Organisation} */ ({
    id: 'org-1',
    orgId: 500123,
    registrations: [
      { id: 'reg-1', registrationNumber: 'R25SR500010912PL' },
      { id: 'reg-2', registrationNumber: null }
    ],
    accreditations: [
      { id: 'acc-1', accreditationNumber: 'ACC500123' },
      { id: 'acc-2', accreditationNumber: null }
    ]
  })

describe('numbersFor', () => {
  it('gives the numbers of the organisation, registration and accreditation', () => {
    expect(
      numbersFor(buildOrganisation(), {
        registrationId: 'reg-1',
        accreditationId: 'acc-1'
      })
    ).toEqual({
      numbers: {
        organisationNumber: '500123',
        registrationNumber: 'R25SR500010912PL',
        accreditationNumber: 'ACC500123'
      },
      unmapped: []
    })
  })

  it('gives a null accreditation number for a null accreditation id', () => {
    expect(
      numbersFor(buildOrganisation(), {
        registrationId: 'reg-1',
        accreditationId: null
      }).numbers
    ).toEqual({
      organisationNumber: '500123',
      registrationNumber: 'R25SR500010912PL',
      accreditationNumber: null
    })
  })

  it('gives no accreditation number when given no accreditation id', () => {
    expect(
      numbersFor(buildOrganisation(), { registrationId: 'reg-1' })
    ).toEqual({
      numbers: {
        organisationNumber: '500123',
        registrationNumber: 'R25SR500010912PL'
      },
      unmapped: []
    })
  })

  it('gives no number for a registration or accreditation that has none, and says why', () => {
    expect(
      numbersFor(buildOrganisation(), {
        registrationId: 'reg-2',
        accreditationId: 'acc-2'
      })
    ).toEqual({
      numbers: { organisationNumber: '500123' },
      unmapped: [
        'registration reg-2 has no registration number',
        'accreditation acc-2 has no accreditation number'
      ]
    })
  })

  it('gives no number for an id the organisation does not hold, and says why', () => {
    expect(
      numbersFor(buildOrganisation(), {
        registrationId: 'reg-gone',
        accreditationId: 'acc-gone'
      })
    ).toEqual({
      numbers: { organisationNumber: '500123' },
      unmapped: [
        'organisation org-1 holds no registration reg-gone',
        'organisation org-1 holds no accreditation acc-gone'
      ]
    })
  })

  for (const [description, orgId] of [
    ['no orgId', undefined],
    ['an orgId that is not an organisation number', 0]
  ]) {
    it(`gives no organisation number for an organisation with ${description}, and says why`, () => {
      expect(
        numbersFor(
          /** @type {Organisation} */ ({ ...buildOrganisation(), orgId }),
          { registrationId: 'reg-1' }
        )
      ).toEqual({
        numbers: { registrationNumber: 'R25SR500010912PL' },
        unmapped: [`organisation org-1 has no organisation number`]
      })
    })
  }
})
