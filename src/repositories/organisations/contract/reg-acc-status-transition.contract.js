import {
  REG_ACC_STATUS,
  REPROCESSING_TYPE
} from '#domain/organisations/model.js'
import { beforeEach, describe, expect } from 'vitest'
import { buildOrganisation, prepareOrgUpdate } from './test-data.js'

export const testRegAccStatusTransitionBehaviour = (it) => {
  describe('registration/accreditation status transitions', () => {
    let repository

    beforeEach(async ({ organisationsRepository }) => {
      repository = await organisationsRepository()
    })

    describe('registration status transitions', () => {
      describe('invalid transitions', () => {
        it('rejects transition from CREATED to SUSPENDED', async () => {
          const orgData = buildOrganisation()
          await repository.insert(orgData)

          const updatePayload = prepareOrgUpdate(orgData, {
            registrations: [
              {
                ...orgData.registrations[0],
                status: REG_ACC_STATUS.SUSPENDED,
                registrationNumber: 'REG12345',
                validFrom: new Date('2025-01-01'),
                validTo: new Date('2025-12-31'),
                reprocessingType: REPROCESSING_TYPE.INPUT
              }
            ]
          })

          await expect(
            repository.replace(orgData.id, 1, updatePayload)
          ).rejects.toMatchObject({
            isBoom: true,
            output: {
              statusCode: 422,
              payload: {
                message: expect.stringContaining(
                  `Cannot transition registration/accreditation status from ${REG_ACC_STATUS.CREATED} to ${REG_ACC_STATUS.SUSPENDED}`
                )
              }
            }
          })
        })
      })

      describe('valid transitions', () => {
        it('allows transition from APPROVED to SUSPENDED', async () => {
          const organisation = buildOrganisation()
          await repository.insert(organisation)
          const inserted = await repository.findById(organisation.id)

          const validFrom = new Date('2025-01-01')
          const validTo = new Date('2025-12-31')

          // First transition: CREATED → APPROVED
          const approvedRegistration = {
            ...inserted.registrations[0],
            status: REG_ACC_STATUS.APPROVED,
            registrationNumber: 'REG12345',
            validFrom,
            validTo,
            reprocessingType: REPROCESSING_TYPE.INPUT
          }

          await repository.replace(
            organisation.id,
            1,
            prepareOrgUpdate(inserted, {
              registrations: [approvedRegistration]
            })
          )

          const afterApproved = await repository.findById(organisation.id, 2)
          expect(afterApproved.registrations[0].status).toBe(
            REG_ACC_STATUS.APPROVED
          )

          // Second transition: APPROVED → SUSPENDED
          const suspendedRegistration = {
            ...approvedRegistration,
            status: REG_ACC_STATUS.SUSPENDED
          }

          await repository.replace(
            organisation.id,
            2,
            prepareOrgUpdate(afterApproved, {
              registrations: [suspendedRegistration]
            })
          )

          const result = await repository.findById(organisation.id, 3)
          const updatedReg = result.registrations.find(
            (r) => r.id === approvedRegistration.id
          )

          expect(updatedReg.status).toBe(REG_ACC_STATUS.SUSPENDED)
          expect(updatedReg.validFrom).toEqual(validFrom)
          expect(updatedReg.validTo).toEqual(validTo)
        })
      })
    })

    describe('accreditation status transitions', () => {
      describe('invalid transitions', () => {
        it('rejects transition from CREATED to SUSPENDED', async () => {
          const orgData = buildOrganisation()
          await repository.insert(orgData)

          const updatePayload = prepareOrgUpdate(orgData, {
            accreditations: [
              {
                ...orgData.accreditations[0],
                status: REG_ACC_STATUS.SUSPENDED,
                accreditationNumber: 'ACC12345',
                validFrom: new Date('2025-01-01'),
                validTo: new Date('2025-12-31'),
                reprocessingType: REPROCESSING_TYPE.INPUT
              }
            ]
          })

          await expect(
            repository.replace(orgData.id, 1, updatePayload)
          ).rejects.toMatchObject({
            isBoom: true,
            output: {
              statusCode: 422,
              payload: {
                message: expect.stringContaining(
                  `Cannot transition registration/accreditation status from ${REG_ACC_STATUS.CREATED} to ${REG_ACC_STATUS.SUSPENDED}`
                )
              }
            }
          })
        })
      })

      describe('valid transitions', () => {
        it('allows transition from APPROVED to SUSPENDED', async () => {
          const organisation = buildOrganisation()
          await repository.insert(organisation)
          const inserted = await repository.findById(organisation.id)

          const validFrom = new Date('2025-01-01')
          const validTo = new Date('2025-12-31')

          // First transition: CREATED → APPROVED (need to approve registration first for accreditation to be approved)
          const approvedRegistration = {
            ...inserted.registrations[0],
            status: REG_ACC_STATUS.APPROVED,
            registrationNumber: 'REG12345',
            validFrom,
            validTo,
            reprocessingType: REPROCESSING_TYPE.INPUT
          }

          const approvedAccreditation = {
            ...inserted.accreditations[0],
            status: REG_ACC_STATUS.APPROVED,
            accreditationNumber: 'ACC12345',
            validFrom,
            validTo,
            reprocessingType: REPROCESSING_TYPE.INPUT
          }

          await repository.replace(
            organisation.id,
            1,
            prepareOrgUpdate(inserted, {
              registrations: [approvedRegistration],
              accreditations: [approvedAccreditation]
            })
          )

          const afterApproved = await repository.findById(organisation.id, 2)
          expect(afterApproved.accreditations[0].status).toBe(
            REG_ACC_STATUS.APPROVED
          )

          // Second transition: APPROVED → SUSPENDED
          const suspendedAccreditation = {
            ...approvedAccreditation,
            status: REG_ACC_STATUS.SUSPENDED
          }

          await repository.replace(
            organisation.id,
            2,
            prepareOrgUpdate(afterApproved, {
              accreditations: [suspendedAccreditation]
            })
          )

          const result = await repository.findById(organisation.id, 3)
          const updatedAcc = result.accreditations.find(
            (a) => a.id === approvedAccreditation.id
          )

          expect(updatedAcc.status).toBe(REG_ACC_STATUS.SUSPENDED)
          expect(updatedAcc.validFrom).toEqual(validFrom)
          expect(updatedAcc.validTo).toEqual(validTo)
        })
      })
    })
  })
}
