import {
  buildOrganisation,
  buildRegistration
} from '#repositories/organisations/contract/test-data.js'
import { partialMock } from '#test/type-helpers.js'

import { diagnoseApplicationContacts } from './diagnose-application-contacts.js'

/** @param {Record<string, unknown>} [overrides] */
const registrationWithoutContact = (overrides = {}) => {
  const { applicationContactDetails: _, ...registration } = buildRegistration({
    status: 'approved',
    ...overrides
  })
  return registration
}

/** @param {ReturnType<typeof buildOrganisation>[]} organisations */
const diagnose = (organisations) =>
  diagnoseApplicationContacts(
    organisations.map((organisation) => partialMock(organisation))
  )

describe('diagnoseApplicationContacts', () => {
  it('describes a registration without an application contact', () => {
    const registration = registrationWithoutContact({
      registrationNumber: 'R26ER5001180041PL'
    })
    const organisation = buildOrganisation({
      schemaVersion: 2,
      registrations: [registration]
    })

    const { rows } = diagnose([organisation])

    expect(rows).toStrictEqual([
      {
        organisationId: organisation.id,
        orgId: organisation.orgId,
        testOrganisation: false,
        schemaVersion: 2,
        registrationId: registration.id,
        registrationNumber: 'R26ER5001180041PL',
        status: 'approved'
      }
    ])
  })

  it('leaves out registrations that have an application contact', () => {
    const organisation = buildOrganisation({
      registrations: [buildRegistration()]
    })

    const { rows } = diagnose([organisation])

    expect(rows).toStrictEqual([])
  })

  it('gives a registration without a number a null registration number', () => {
    const organisation = buildOrganisation({
      registrations: [registrationWithoutContact({ registrationNumber: null })]
    })

    const { rows } = diagnose([organisation])

    expect(rows).toStrictEqual([
      expect.objectContaining({ registrationNumber: null })
    ])
  })

  it('counts what it scanned, what is missing, and what the read routes would drop', () => {
    const { summary } = diagnose([
      buildOrganisation({
        registrations: [
          buildRegistration(),
          registrationWithoutContact({
            registrationNumber: 'R26ER5001180041PL'
          })
        ]
      }),
      buildOrganisation({
        registrations: [
          registrationWithoutContact({ registrationNumber: null })
        ]
      })
    ])

    expect(summary).toStrictEqual({
      scannedOrganisations: 2,
      scannedRegistrations: 3,
      missingApplicationContact: 2,
      missingWithRegistrationNumber: 1
    })
  })
})
