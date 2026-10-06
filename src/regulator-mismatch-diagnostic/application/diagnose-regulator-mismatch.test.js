import {
  buildAccreditation,
  buildOrganisation,
  buildRegistration
} from '#repositories/organisations/contract/test-data.js'
import { TEST_ORGANISATION_IDS } from '#common/helpers/parse-test-organisations.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { partialMock } from '#test/type-helpers.js'

import { diagnoseRegulatorMismatch } from './diagnose-regulator-mismatch.js'

/** @import { Accreditation } from '#domain/organisations/accreditation.js' */

/**
 * @param {ReturnType<typeof buildOrganisation>[]} organisations
 */
const readThroughRepository = async (organisations) =>
  createInMemoryOrganisationsRepository(
    organisations.map((organisation) => partialMock(organisation))
  )().findAll()

const [TEST_ORGANISATION_ID] = TEST_ORGANISATION_IDS

/**
 * @param {Partial<Accreditation>} accreditationOverrides
 * @param {object} [registrationOverrides]
 */
const linkedPair = (accreditationOverrides, registrationOverrides = {}) => {
  const accreditation = buildAccreditation(accreditationOverrides)
  const registration = buildRegistration({
    accreditationId: accreditation.id,
    ...registrationOverrides
  })
  return { registration, accreditation }
}

describe('diagnoseRegulatorMismatch', () => {
  it('reports a linked pair whose regulators differ', async () => {
    const { registration, accreditation } = linkedPair(
      {
        submittedToRegulator: 'nrw',
        accreditationNumber: 'A25ER500010PL'
      },
      { submittedToRegulator: 'ea', registrationNumber: 'R25ER500010PL' }
    )
    const organisation = buildOrganisation({
      registrations: [registration],
      accreditations: [accreditation]
    })

    const { rows } = diagnoseRegulatorMismatch(
      await readThroughRepository([organisation])
    )

    expect(rows).toEqual([
      {
        organisationId: organisation.id,
        orgId: organisation.orgId,
        testOrganisation: false,
        registrationId: registration.id,
        registrationNumber: 'R25ER500010PL',
        registrationStatus: 'created',
        registrationRegulator: 'ea',
        accreditationId: accreditation.id,
        accreditationNumber: 'A25ER500010PL',
        accreditationStatus: 'created',
        accreditationRegulator: 'nrw'
      }
    ])
  })

  it('reports a mismatched pair that has no numbers', async () => {
    const { registration, accreditation } = linkedPair(
      { submittedToRegulator: 'sepa', accreditationNumber: null },
      { registrationNumber: null }
    )

    const { rows } = diagnoseRegulatorMismatch(
      await readThroughRepository([
        buildOrganisation({
          registrations: [registration],
          accreditations: [accreditation]
        })
      ])
    )

    expect(rows).toEqual([
      expect.objectContaining({
        registrationNumber: null,
        accreditationNumber: null
      })
    ])
  })

  it('passes over linked pairs that agree and records that are not linked', async () => {
    const matching = linkedPair({ submittedToRegulator: 'ea' })
    const organisation = buildOrganisation({
      registrations: [
        matching.registration,
        buildRegistration({ submittedToRegulator: 'niea' })
      ],
      accreditations: [
        matching.accreditation,
        buildAccreditation({ submittedToRegulator: 'nrw' })
      ]
    })

    const { rows, summary } = diagnoseRegulatorMismatch(
      await readThroughRepository([organisation])
    )

    expect(rows).toEqual([])
    expect(summary.linkedPairs).toBe(1)
  })

  it('totals what it scanned and what it found across every organisation', async () => {
    const mismatched = linkedPair({ submittedToRegulator: 'nrw' })
    const mismatchedInTest = linkedPair({ submittedToRegulator: 'sepa' })
    const matching = linkedPair({ submittedToRegulator: 'ea' })
    const first = buildOrganisation({
      registrations: [mismatched.registration, matching.registration],
      accreditations: [mismatched.accreditation, matching.accreditation]
    })
    const second = buildOrganisation({
      orgId: TEST_ORGANISATION_ID,
      registrations: [mismatchedInTest.registration],
      accreditations: [mismatchedInTest.accreditation]
    })

    const { rows, summary } = diagnoseRegulatorMismatch(
      await readThroughRepository([first, second])
    )

    expect(rows.map((row) => row.testOrganisation)).toEqual([false, true])
    expect(summary).toEqual({
      scannedOrganisations: 2,
      linkedPairs: 3,
      mismatchedPairs: 2,
      mismatchedInTestOrganisations: 1
    })
  })
})
