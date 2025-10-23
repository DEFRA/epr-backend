import { ObjectId } from 'mongodb'
import { buildOrganisation } from './test-data.js'

export const testFindRegistrationByIdBehaviour = (repositoryFactory) => {
  describe('findRegistrationById', () => {
    let repository

    beforeEach(async () => {
      repository = await repositoryFactory()
    })

    it('returns registration when both organisation ID and registration ID are valid', async () => {
      const registration1 = {
        id: new ObjectId().toString(),
        orgName: 'Test Org 1',
        material: 'glass',
        wasteProcessingType: 'reprocessor',
        wasteRegistrationNumber: 'CBDU111111',
        formSubmissionTime: '2025-08-20T19:34:44.944Z',
        submittedToRegulator: 'ea'
      }

      const registration2 = {
        id: new ObjectId().toString(),
        orgName: 'Test Org 2',
        material: 'plastic',
        wasteProcessingType: 'exporter',
        wasteRegistrationNumber: 'CBDU222222',
        formSubmissionTime: '2025-08-21T19:34:44.944Z',
        submittedToRegulator: 'ea'
      }

      const org = buildOrganisation({
        registrations: [registration1, registration2]
      })

      await repository.insert(org)

      const result = await repository.findRegistrationById(
        org.id,
        registration1.id
      )

      expect(result).toMatchObject({
        id: registration1.id,
        orgName: registration1.orgName,
        material: registration1.material,
        wasteProcessingType: registration1.wasteProcessingType,
        wasteRegistrationNumber: registration1.wasteRegistrationNumber
      })
    })

    it('returns null when organisation does not exist', async () => {
      const nonExistentOrgId = new ObjectId().toString()
      const registrationId = new ObjectId().toString()

      const result = await repository.findRegistrationById(
        nonExistentOrgId,
        registrationId
      )

      expect(result).toBeNull()
    })

    it('returns null when registration does not exist in organisation', async () => {
      const registration = {
        id: new ObjectId().toString(),
        orgName: 'Test Org',
        material: 'glass',
        wasteProcessingType: 'reprocessor',
        wasteRegistrationNumber: 'CBDU111111',
        formSubmissionTime: '2025-08-20T19:34:44.944Z',
        submittedToRegulator: 'ea'
      }

      const org = buildOrganisation({
        registrations: [registration]
      })

      await repository.insert(org)

      const nonExistentRegistrationId = new ObjectId().toString()
      const result = await repository.findRegistrationById(
        org.id,
        nonExistentRegistrationId
      )

      expect(result).toBeNull()
    })

    it('does not return registrations from different organisations', async () => {
      const registration1 = {
        id: new ObjectId().toString(),
        orgName: 'Org 1',
        material: 'glass',
        wasteProcessingType: 'reprocessor',
        wasteRegistrationNumber: 'CBDU111111',
        formSubmissionTime: '2025-08-20T19:34:44.944Z',
        submittedToRegulator: 'ea'
      }

      const registration2 = {
        id: new ObjectId().toString(),
        orgName: 'Org 2',
        material: 'plastic',
        wasteProcessingType: 'exporter',
        wasteRegistrationNumber: 'CBDU222222',
        formSubmissionTime: '2025-08-21T19:34:44.944Z',
        submittedToRegulator: 'ea'
      }

      const org1 = buildOrganisation({ registrations: [registration1] })
      const org2 = buildOrganisation({ registrations: [registration2] })

      await Promise.all([org1, org2].map((org) => repository.insert(org)))

      const result = await repository.findRegistrationById(
        org1.id,
        registration2.id
      )

      expect(result).toBeNull()
    })
  })
}
