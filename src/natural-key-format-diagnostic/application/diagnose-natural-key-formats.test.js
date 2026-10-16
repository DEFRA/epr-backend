import {
  buildAccreditation,
  buildOrganisation,
  buildRegistration
} from '#repositories/organisations/contract/test-data.js'
import { partialMock } from '#test/type-helpers.js'

import { diagnoseNaturalKeyFormats } from './diagnose-natural-key-formats.js'

/**
 * @param {{
 *   registrations?: Array<{ registrationNumber: string | null, status: string }>,
 *   accreditations?: Array<{ accreditationNumber: string | null, status: string }>
 * }} records
 */
const organisationHolding = ({ registrations = [], accreditations = [] }) =>
  buildOrganisation({
    registrations: registrations.map((registration) =>
      buildRegistration(registration)
    ),
    accreditations: accreditations.map((accreditation) =>
      buildAccreditation(/** @type {never} */ (accreditation))
    )
  })

/** @param {ReturnType<typeof buildOrganisation>[]} organisations */
const diagnose = (organisations) =>
  diagnoseNaturalKeyFormats(
    organisations.map((organisation) => partialMock(organisation))
  )

describe('diagnoseNaturalKeyFormats', () => {
  it('passes registration and accreditation numbers in the expected format', () => {
    const { rows, summary } = diagnose([
      organisationHolding({
        registrations: [
          { registrationNumber: 'R26ER5001180041PL', status: 'approved' }
        ],
        accreditations: [
          { accreditationNumber: 'A26ER5001180114PL', status: 'approved' }
        ]
      })
    ])

    expect(rows).toStrictEqual([])
    expect(summary).toStrictEqual({
      scannedOrganisations: 1,
      checkedRegistrations: 1,
      checkedAccreditations: 1,
      mismatchedRegistrationNumbers: 0,
      mismatchedAccreditationNumbers: 0
    })
  })

  it('names every record whose registration number is in another format', () => {
    const organisation = organisationHolding({
      registrations: [{ registrationNumber: 'REG12345', status: 'approved' }]
    })

    const { rows } = diagnose([organisation])

    expect(rows).toStrictEqual([
      {
        recordType: 'registration',
        number: 'REG12345',
        breaksUrlSegment: false,
        organisationId: organisation.id,
        orgId: organisation.orgId,
        testOrganisation: false,
        recordId: organisation.registrations[0].id,
        status: 'approved'
      }
    ])
  })

  it('reports an accreditation number in another format', () => {
    const { rows } = diagnose([
      organisationHolding({
        accreditations: [{ accreditationNumber: 'ACC-1', status: 'suspended' }]
      })
    ])

    expect(rows).toStrictEqual([
      expect.objectContaining({
        recordType: 'accreditation',
        number: 'ACC-1',
        status: 'suspended'
      })
    ])
  })

  it.each([
    ['a slash', 'EPR/AB1234CD/R1'],
    ['a space', 'R26ER 5001180041PL']
  ])('flags a number with %s as one a URL segment cannot hold', (_, number) => {
    const { rows } = diagnose([
      organisationHolding({
        registrations: [{ registrationNumber: number, status: 'approved' }]
      })
    ])

    expect(rows).toStrictEqual([
      expect.objectContaining({ number, breaksUrlSegment: true })
    ])
  })

  it.each([
    ['null', null],
    ['absent', undefined]
  ])('reports an addressed record whose number is %s', (_, number) => {
    const { rows } = diagnose([
      organisationHolding({
        registrations: [
          {
            registrationNumber: /** @type {null} */ (number),
            status: 'cancelled'
          }
        ]
      })
    ])

    expect(rows).toStrictEqual([
      expect.objectContaining({ number: null, breaksUrlSegment: false })
    ])
  })

  it('skips records no page addresses by number', () => {
    const { rows, summary } = diagnose([
      organisationHolding({
        registrations: [
          { registrationNumber: null, status: 'created' },
          { registrationNumber: 'REG12345', status: 'rejected' }
        ],
        accreditations: [{ accreditationNumber: 'ACC-1', status: 'created' }]
      })
    ])

    expect(rows).toStrictEqual([])
    expect(summary.checkedRegistrations).toBe(0)
    expect(summary.checkedAccreditations).toBe(0)
  })

  it('counts the records checked and the numbers that do not match', () => {
    const { summary } = diagnose([
      organisationHolding({
        registrations: [
          { registrationNumber: 'R26ER5001180041PL', status: 'approved' },
          { registrationNumber: 'REG12345', status: 'cancelled' }
        ],
        accreditations: [
          { accreditationNumber: 'ACC-1', status: 'approved' },
          { accreditationNumber: 'ACC-2', status: 'cancelled' }
        ]
      }),
      organisationHolding({})
    ])

    expect(summary).toStrictEqual({
      scannedOrganisations: 2,
      checkedRegistrations: 2,
      checkedAccreditations: 2,
      mismatchedRegistrationNumbers: 1,
      mismatchedAccreditationNumbers: 2
    })
  })
})
