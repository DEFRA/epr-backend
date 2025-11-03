import { describe, beforeEach, expect } from 'vitest'
import { ObjectId } from 'mongodb'
import { buildOrganisation } from './test-data.js'

export const testFindRegistrationByIdBehaviour = (it) => {
  describe('findRegistrationById', () => {
    let repository

    beforeEach(async ({ organisationsRepository }) => {
      repository = await organisationsRepository()
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

    it('throws 404 when organisation does not exist', async () => {
      const nonExistentOrgId = new ObjectId().toString()
      const registrationId = new ObjectId().toString()

      await expect(
        repository.findRegistrationById(nonExistentOrgId, registrationId)
      ).rejects.toMatchObject({
        isBoom: true,
        output: { statusCode: 404 }
      })
    })

    it('throws 404 when registration does not exist in organisation', async () => {
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
      await expect(
        repository.findRegistrationById(org.id, nonExistentRegistrationId)
      ).rejects.toMatchObject({
        isBoom: true,
        output: { statusCode: 404 }
      })
    })

    it('throws 404 when registration is from different organisation', async () => {
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

      await expect(
        repository.findRegistrationById(org1.id, registration2.id)
      ).rejects.toMatchObject({
        isBoom: true,
        output: { statusCode: 404 }
      })
    })

    it('throws 404 for invalid organisation ID format', async () => {
      await expect(
        repository.findRegistrationById('invalid-id', 'reg-123')
      ).rejects.toMatchObject({
        isBoom: true,
        output: { statusCode: 404 }
      })
    })

    it('throws timeout error when minimumOrgVersion never arrives', async () => {
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

      // Request a version that will never exist
      await expect(
        repository.findRegistrationById(org.id, registration.id, 999)
      ).rejects.toMatchObject({
        isBoom: true,
        output: { statusCode: 500 },
        message: 'Consistency timeout waiting for minimum version'
      })
    })

    it('waits for minimumOrgVersion and returns registration when version arrives', async () => {
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

      // Update to create version 2
      await repository.update(org.id, 1, {
        wasteProcessingTypes: ['exporter']
      })

      // Request with minimumOrgVersion=2 - should retry until version 2 appears
      const result = await repository.findRegistrationById(
        org.id,
        registration.id,
        2
      )

      expect(result).toMatchObject({
        id: registration.id,
        orgName: registration.orgName,
        material: registration.material
      })
    })

    it('waits for minimumOrgVersion and throws 404 when registration does not exist', async () => {
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

      // Update to create version 2
      await repository.update(org.id, 1, {
        wasteProcessingTypes: ['exporter']
      })

      const nonExistentRegistrationId = new ObjectId().toString()

      // Request with minimumOrgVersion=2 for non-existent registration
      await expect(
        repository.findRegistrationById(org.id, nonExistentRegistrationId, 2)
      ).rejects.toMatchObject({
        isBoom: true,
        output: { statusCode: 404 }
      })
    })

    it('throws 404 when waiting for non-existent organisation with minimumOrgVersion', async () => {
      const nonExistentOrgId = new ObjectId().toString()
      const registrationId = new ObjectId().toString()

      // Request minimumOrgVersion for org that doesn't exist - should retry then throw 404
      await expect(
        repository.findRegistrationById(nonExistentOrgId, registrationId, 1)
      ).rejects.toMatchObject({
        isBoom: true,
        output: { statusCode: 404 }
      })
    })
  })
}
