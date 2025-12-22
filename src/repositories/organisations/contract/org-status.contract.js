import {
  ORGANISATION_STATUS,
  REPROCESSING_TYPE,
  STATUS
} from '#domain/organisations/model.js'
import { beforeEach, describe, expect } from 'vitest'
import { buildOrganisation, prepareOrgUpdate } from './test-data.js'

export const testOrgStatusTransitionBehaviour = (it) => {
  describe('organisation status transitions', () => {
    let repository

    beforeEach(async ({ organisationsRepository }) => {
      repository = await organisationsRepository()
    })

    describe('invalid transitions', () => {
      it('rejects transition from CREATED to ACTIVE', async () => {
        const orgData = buildOrganisation()
        await repository.insert(orgData)

        const updatePayload = prepareOrgUpdate(orgData, {
          status: ORGANISATION_STATUS.ACTIVE
        })

        await expect(
          repository.replace(orgData.id, 1, updatePayload)
        ).rejects.toMatchObject({
          isBoom: true,
          output: {
            statusCode: 422,
            payload: {
              message: expect.stringContaining(
                `Cannot transition organisation status from ${ORGANISATION_STATUS.CREATED} to ${ORGANISATION_STATUS.ACTIVE}`
              )
            }
          }
        })
      })

      it('rejects transition to APPROVED without approved registration', async () => {
        const orgData = buildOrganisation()
        await repository.insert(orgData)

        const approvedUpdate = prepareOrgUpdate(orgData, {
          status: ORGANISATION_STATUS.APPROVED
        })

        await expect(
          repository.replace(orgData.id, 1, approvedUpdate)
        ).rejects.toMatchObject({
          isBoom: true,
          output: {
            statusCode: 422,
            payload: {
              message: expect.stringContaining(
                `Cannot approve organisation without at least one approved registration`
              )
            }
          }
        })
      })

      it('rejects transition from APPROVED to ACTIVE without linked defra organisation', async () => {
        const orgData = buildOrganisation()
        await repository.insert(orgData)

        const approvedUpdate = prepareOrgUpdate(orgData, {
          status: ORGANISATION_STATUS.APPROVED,
          registrations: [
            {
              ...orgData.registrations[0],
              status: STATUS.APPROVED,
              registrationNumber: 'REG12345',
              validFrom: new Date('2025-01-01'),
              validTo: new Date('2025-12-31'),
              reprocessingType: REPROCESSING_TYPE.INPUT
            }
          ]
        })

        await repository.replace(orgData.id, 1, approvedUpdate)

        const result = await repository.findById(orgData.id, 2)
        expect(result.status).toBe(ORGANISATION_STATUS.APPROVED)

        const activeUpdate = prepareOrgUpdate(orgData, {
          status: ORGANISATION_STATUS.ACTIVE,
          registrations: [
            {
              ...orgData.registrations[0],
              status: STATUS.APPROVED,
              registrationNumber: 'REG12345',
              validFrom: new Date('2025-01-01'),
              validTo: new Date('2025-12-31'),
              reprocessingType: REPROCESSING_TYPE.INPUT
            }
          ]
        })

        await expect(
          repository.replace(orgData.id, 2, activeUpdate)
        ).rejects.toMatchObject({
          isBoom: true,
          output: {
            statusCode: 422,
            payload: {
              message: expect.stringContaining(
                `Cannot activate organisation without linking to a Defra organisation`
              )
            }
          }
        })
      })
    })

    describe('valid transitions', () => {
      it('allows transition from CREATED to APPROVED with approved registrations ', async () => {
        const orgData = buildOrganisation()
        await repository.insert(orgData)

        const updatePayload = prepareOrgUpdate(orgData, {
          status: ORGANISATION_STATUS.APPROVED,
          registrations: [
            {
              ...orgData.registrations[0],
              status: STATUS.APPROVED,
              registrationNumber: 'REG12345',
              validFrom: new Date('2025-01-01'),
              validTo: new Date('2025-12-31'),
              reprocessingType: REPROCESSING_TYPE.INPUT
            }
          ]
        })

        await repository.replace(orgData.id, 1, updatePayload)

        const result = await repository.findById(orgData.id, 2)
        expect(result.status).toBe(ORGANISATION_STATUS.APPROVED)
      })

      it('allows transition from APPROVED to ACTIVE with linked defra organisation', async () => {
        const orgData = buildOrganisation()
        await repository.insert(orgData)

        const approvedUpdate = prepareOrgUpdate(orgData, {
          status: ORGANISATION_STATUS.APPROVED,
          registrations: [
            {
              ...orgData.registrations[0],
              status: STATUS.APPROVED,
              registrationNumber: 'REG12345',
              validFrom: new Date('2025-01-01'),
              validTo: new Date('2025-12-31'),
              reprocessingType: REPROCESSING_TYPE.INPUT
            }
          ]
        })

        await repository.replace(orgData.id, 1, approvedUpdate)

        let result = await repository.findById(orgData.id, 2)
        expect(result.status).toBe(ORGANISATION_STATUS.APPROVED)

        const activeUpdate = prepareOrgUpdate(orgData, {
          status: ORGANISATION_STATUS.ACTIVE,
          linkedDefraOrganisation: {
            orgId: 'afefc943-ed7b-48da-8c75-040081d5f70b',
            orgName: 'Lost Ark Adventures Ltd',
            linkedBy: {
              email: 'anakin.skywalker@starwars.com',
              id: '2f69cb58-a87d-4501-896c-15eb080c6d44'
            },
            linkedAt: new Date()
          },
          registrations: [
            {
              ...orgData.registrations[0],
              status: STATUS.APPROVED,
              registrationNumber: 'REG12345',
              validFrom: new Date('2025-01-01'),
              validTo: new Date('2025-12-31'),
              reprocessingType: REPROCESSING_TYPE.INPUT
            }
          ]
        })

        await repository.replace(orgData.id, 2, activeUpdate)

        result = await repository.findById(orgData.id, 3)
        expect(result.status).toBe(ORGANISATION_STATUS.ACTIVE)
      })
    })
  })
}
