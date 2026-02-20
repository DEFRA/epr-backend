import { describe, beforeEach, expect } from 'vitest'
import { ObjectId } from 'mongodb'
import {
  buildOrganisation,
  buildRegistration,
  buildAccreditation,
  prepareOrgUpdate
} from './test-data.js'

export const testFindRegistrationByIdBehaviour = (it) => {
  describe('findRegistrationById', () => {
    let repository

    beforeEach(async ({ organisationsRepository }) => {
      repository = await organisationsRepository()
    })

    it('returns registration with hydrated accreditation when both organisation ID and registration ID are valid', async () => {
      const accreditation = buildAccreditation()

      const registration = buildRegistration({
        orgName: 'Test Org 1',
        accreditationId: accreditation.id
      })

      const org = buildOrganisation({
        registrations: [registration],
        accreditations: [accreditation]
      })

      await repository.insert(org)

      const result = await repository.findRegistrationById(
        org.id,
        registration.id
      )

      expect(result).toMatchObject({
        id: registration.id,
        orgName: registration.orgName,
        material: registration.material,
        wasteProcessingType: registration.wasteProcessingType,
        cbduNumber: registration.cbduNumber,
        accreditation: expect.objectContaining({
          id: accreditation.id
        })
      })
    })

    it('returns registration with hydrated accreditation when accreditationId exists', async () => {
      const accreditation = buildAccreditation()

      const registration = buildRegistration({
        accreditationId: accreditation.id
      })

      const org = buildOrganisation({
        registrations: [registration],
        accreditations: [accreditation]
      })

      await repository.insert(org)

      const result = await repository.findRegistrationById(
        org.id,
        registration.id
      )

      expect(result.accreditation).toMatchObject({
        id: accreditation.id,
        accreditationNumber: accreditation.accreditationNumber,
        material: accreditation.material,
        wasteProcessingType: accreditation.wasteProcessingType
      })
    })

    it('throws 404 when registration has no accreditationId', async () => {
      const registration = buildRegistration({
        material: 'plastic',
        wasteProcessingType: 'exporter',
        cbduNumber: 'CBDU222222'
      })

      const org = buildOrganisation({
        registrations: [registration]
      })

      await repository.insert(org)

      await expect(
        repository.findRegistrationById(org.id, registration.id)
      ).rejects.toMatchObject({
        isBoom: true,
        output: { statusCode: 404 }
      })
    })

    it('throws 404 when accreditationId does not match any accreditation', async () => {
      const registration = buildRegistration({
        cbduNumber: 'CBDU333333',
        accreditationId: new ObjectId().toString()
      })

      const org = buildOrganisation({
        registrations: [registration]
      })

      await repository.insert(org)

      await expect(
        repository.findRegistrationById(org.id, registration.id)
      ).rejects.toMatchObject({
        isBoom: true,
        output: { statusCode: 404 }
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
      const registration = buildRegistration()

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
      const registration1 = buildRegistration()

      const registration2 = buildRegistration()

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
      const accreditation = buildAccreditation()
      const registration = buildRegistration({
        accreditationId: accreditation.id
      })

      const org = buildOrganisation({
        registrations: [registration],
        accreditations: [accreditation]
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
      const accreditation = buildAccreditation()
      const registration = buildRegistration({
        accreditationId: accreditation.id
      })

      const org = buildOrganisation({
        registrations: [registration],
        accreditations: [accreditation]
      })

      await repository.insert(org)

      // Update to create version 2
      const orgAfterInsert = await repository.findById(org.id)
      const updatePayload = prepareOrgUpdate(orgAfterInsert, {
        wasteProcessingTypes: ['exporter']
      })
      await repository.replace(org.id, 1, updatePayload)

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
      const accreditation = buildAccreditation()
      const registration = buildRegistration({
        accreditationId: accreditation.id
      })

      const org = buildOrganisation({
        registrations: [registration],
        accreditations: [accreditation]
      })

      await repository.insert(org)

      // Update to create version 2
      const orgAfterInsert = await repository.findById(org.id)
      const updatePayload = prepareOrgUpdate(orgAfterInsert, {
        wasteProcessingTypes: ['exporter']
      })
      await repository.replace(org.id, 1, updatePayload)

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
