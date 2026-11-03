import { createOrganisationBuilders } from '#repositories/organisations/contract/test-data.js'
import {
  toAccreditationNumber,
  toOrganisationNumber,
  toRegistrationNumber
} from '#domain/organisations/numbers.js'
import {
  ACCREDITATION_NUMBER,
  REPROCESSOR_NUMBER,
  accreditation,
  reprocessor
} from './organisation-read-test-helpers.js'

const { buildOrganisation } = createOrganisationBuilders()

/** @import { OrganisationReadRepositoryContractIt } from '../port.contract.js' */

const OTHER_REGISTRATION_NUMBER = 'R26ER5001180099PL'

/**
 * @param {OrganisationReadRepositoryContractIt} it
 */
export const testFindAccreditationByNumberBehaviour = (it) => {
  describe('findAccreditationByNumber', () => {
    it('returns the accreditation with the year it is keyed by', async ({
      organisationReadRepositoryWith
    }) => {
      const granted = accreditation()
      const stored = buildOrganisation({
        registrations: [reprocessor({ accreditationId: granted.id })],
        accreditations: [granted]
      })
      const repository = await organisationReadRepositoryWith({
        organisations: [stored]
      })

      const found = await repository.findAccreditationByNumber(
        toOrganisationNumber(String(stored.orgId)),
        toRegistrationNumber(REPROCESSOR_NUMBER),
        toAccreditationNumber(ACCREDITATION_NUMBER)
      )

      expect(found?.year).toBe('2026')
      expect(found?.accreditation.accreditationNumber).toBe(
        ACCREDITATION_NUMBER
      )
      expect(found?.organisation.organisationNumber).toBe(String(stored.orgId))
      expect(found?.registration).toBe(
        found?.organisation.registrations[REPROCESSOR_NUMBER]
      )
      expect(found?.accreditation).toBe(
        found?.registration.accreditations['2026']
      )
    })

    it('returns null for an accreditation under another registration', async ({
      organisationReadRepositoryWith
    }) => {
      const granted = accreditation()
      const stored = buildOrganisation({
        registrations: [
          reprocessor({ accreditationId: granted.id }),
          reprocessor({ registrationNumber: OTHER_REGISTRATION_NUMBER })
        ],
        accreditations: [granted]
      })
      const repository = await organisationReadRepositoryWith({
        organisations: [stored]
      })

      expect(
        await repository.findAccreditationByNumber(
          toOrganisationNumber(String(stored.orgId)),
          toRegistrationNumber(OTHER_REGISTRATION_NUMBER),
          toAccreditationNumber(ACCREDITATION_NUMBER)
        )
      ).toBeNull()
    })

    it('returns null for an unknown accreditation number', async ({
      organisationReadRepositoryWith
    }) => {
      const granted = accreditation()
      const stored = buildOrganisation({
        registrations: [reprocessor({ accreditationId: granted.id })],
        accreditations: [granted]
      })
      const repository = await organisationReadRepositoryWith({
        organisations: [stored]
      })

      expect(
        await repository.findAccreditationByNumber(
          toOrganisationNumber(String(stored.orgId)),
          toRegistrationNumber(REPROCESSOR_NUMBER),
          toAccreditationNumber('A26ER9999999999PL')
        )
      ).toBeNull()
    })

    it('returns null for an unknown registration number', async ({
      organisationReadRepositoryWith
    }) => {
      const granted = accreditation()
      const stored = buildOrganisation({
        registrations: [reprocessor({ accreditationId: granted.id })],
        accreditations: [granted]
      })
      const repository = await organisationReadRepositoryWith({
        organisations: [stored]
      })

      expect(
        await repository.findAccreditationByNumber(
          toOrganisationNumber(String(stored.orgId)),
          toRegistrationNumber('R26ER9999999999PL'),
          toAccreditationNumber(ACCREDITATION_NUMBER)
        )
      ).toBeNull()
    })
  })
}
