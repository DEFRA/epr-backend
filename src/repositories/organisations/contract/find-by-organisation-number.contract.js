import { beforeEach, describe, expect } from 'vitest'
import { prepareOrgUpdate } from './test-data.js'

/** @import { OrganisationBuilders } from './test-data.js' */

export const testFindByOrganisationNumberBehaviour = (it) => {
  describe('findByOrganisationNumber', () => {
    let repository
    /** @type {OrganisationBuilders['buildOrganisation']} */
    let buildOrganisation
    /** @type {OrganisationBuilders['nextOrganisationNumber']} */
    let nextOrganisationNumber

    beforeEach(
      async (
        /** @type {{ organisationsRepository: import('../port.js').OrganisationsRepositoryFactory, organisationBuilders: OrganisationBuilders }} */ {
          organisationsRepository,
          organisationBuilders
        }
      ) => {
        repository = await organisationsRepository()
        buildOrganisation = organisationBuilders.buildOrganisation
        nextOrganisationNumber = organisationBuilders.nextOrganisationNumber
      }
    )

    it('returns the organisation holding the number', async () => {
      const orgData = buildOrganisation()
      await repository.insert(orgData)

      const found = await repository.findByOrganisationNumber(
        orgData.organisationNumber
      )

      expect(found).toMatchObject({
        id: orgData.id,
        organisationNumber: orgData.organisationNumber
      })
    })

    it('returns null for an unknown number', async () => {
      await expect(
        repository.findByOrganisationNumber(nextOrganisationNumber())
      ).resolves.toBeNull()
    })

    it('throws timeout error when minimumVersion never arrives', async () => {
      const orgData = buildOrganisation()
      await repository.insert(orgData)

      await expect(
        repository.findByOrganisationNumber(orgData.organisationNumber, 999)
      ).rejects.toMatchObject({
        isBoom: true,
        output: { statusCode: 500 },
        message: 'Consistency timeout waiting for minimum version'
      })
    })

    it('waits for minimumVersion and returns organisation when version arrives', async () => {
      const orgData = buildOrganisation()
      await repository.insert(orgData)

      const orgAfterInsert = await repository.findById(orgData.id)
      const updatePayload = prepareOrgUpdate(orgAfterInsert, {
        wasteProcessingTypes: ['exporter']
      })
      await repository.replace(orgData.id, 1, updatePayload)

      const result = await repository.findByOrganisationNumber(
        orgData.organisationNumber,
        2
      )

      expect(result).toMatchObject({
        id: orgData.id,
        wasteProcessingTypes: ['exporter'],
        version: 2
      })
    })

    it('returns null when waiting for a number no organisation holds', async () => {
      await expect(
        repository.findByOrganisationNumber(nextOrganisationNumber(), 1)
      ).resolves.toBeNull()
    })
  })
}
