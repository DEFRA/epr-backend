import { createOrganisationBuilders } from '#repositories/organisations/contract/test-data.js'
import {
  toOrganisationNumber,
  toRegistrationNumber
} from '#domain/organisations/numbers.js'
import {
  REPROCESSOR_NUMBER,
  reprocessor
} from './organisation-read-test-helpers.js'

const { buildOrganisation, nextOrgId } = createOrganisationBuilders()

/** @import { OrganisationReadRepositoryContractIt } from '../port.contract.js' */

/**
 * @param {OrganisationReadRepositoryContractIt} it
 */
export const testFindRegistrationByNumberBehaviour = (it) => {
  describe('findRegistrationByNumber', () => {
    it('returns the organisation and the registration with that number', async ({
      organisationReadRepositoryWith
    }) => {
      const stored = buildOrganisation({ registrations: [reprocessor()] })
      const repository = await organisationReadRepositoryWith({
        organisations: [stored]
      })

      const found = await repository.findRegistrationByNumber(
        toOrganisationNumber(String(stored.orgId)),
        toRegistrationNumber(REPROCESSOR_NUMBER)
      )

      expect(found?.organisation.organisationNumber).toBe(String(stored.orgId))
      expect(found?.registration).toBe(
        found?.organisation.registrations[REPROCESSOR_NUMBER]
      )
      expect(found?.registration.wasteProcessingType).toBe('reprocessor')
    })

    it('returns null for an unknown organisation number', async ({
      organisationReadRepositoryWith
    }) => {
      const repository = await organisationReadRepositoryWith({
        organisations: [buildOrganisation({ registrations: [reprocessor()] })]
      })

      expect(
        await repository.findRegistrationByNumber(
          toOrganisationNumber(String(nextOrgId())),
          toRegistrationNumber(REPROCESSOR_NUMBER)
        )
      ).toBeNull()
    })

    it('returns null for a registration number the organisation does not have', async ({
      organisationReadRepositoryWith
    }) => {
      const stored = buildOrganisation({ registrations: [reprocessor()] })
      const repository = await organisationReadRepositoryWith({
        organisations: [stored]
      })

      expect(
        await repository.findRegistrationByNumber(
          toOrganisationNumber(String(stored.orgId)),
          toRegistrationNumber('R26ER9999999999PL')
        )
      ).toBeNull()
    })
  })
}
