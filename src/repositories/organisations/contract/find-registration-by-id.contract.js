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

    it('returns null for invalid organisation ID format', async () => {
      const result = await repository.findRegistrationById(
        'invalid-id',
        'reg-123'
      )

      expect(result).toBeNull()
    })

    it('throws timeout error when expectedOrgVersion never arrives', async () => {
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
        message: 'Consistency timeout waiting for expected version'
      })
    })

    it('waits for expectedOrgVersion and returns registration when version arrives', async () => {
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

      // Request with expectedOrgVersion=2 - should retry until version 2 appears
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

    it('waits for expectedOrgVersion and returns null when registration does not exist', async () => {
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

      // Request with expectedOrgVersion=2 for non-existent registration
      const result = await repository.findRegistrationById(
        org.id,
        nonExistentRegistrationId,
        2
      )

      expect(result).toBeNull()
    })

    it('returns null when waiting for non-existent organisation with expectedOrgVersion', async () => {
      const nonExistentOrgId = new ObjectId().toString()
      const registrationId = new ObjectId().toString()

      // Request expectedOrgVersion for org that doesn't exist - should retry then return null
      const result = await repository.findRegistrationById(
        nonExistentOrgId,
        registrationId,
        1
      )

      expect(result).toBeNull()
    })
  })
}
