import assert from 'node:assert'
import {
  REG_ACC_STATUS,
  REPROCESSING_TYPE
} from '#domain/organisations/model.js'
import { beforeEach, describe, expect } from 'vitest'
import {
  buildOrganisation,
  prepareOrgUpdate,
  getValidDateRange
} from './test-data.js'

export const testRegAccStatusTransitionBehaviour = (it) => {
  // Date strings for validFrom/validTo
  const { VALID_FROM, VALID_TO } = getValidDateRange()

  describe('registration/accreditation status transitions', () => {
    let repository

    beforeEach(async ({ organisationsRepository }) => {
      repository = await organisationsRepository()
    })

    describe('registration status transitions', () => {
      describe('transitions from CREATED', () => {
        it('rejects transition from CREATED to SUSPENDED', async () => {
          const orgData = buildOrganisation()
          await repository.insert(orgData)

          const updatePayload = prepareOrgUpdate(orgData, {
            registrations: [
              {
                ...orgData.registrations[0],
                status: REG_ACC_STATUS.SUSPENDED,
                registrationNumber: 'REG12345',
                validFrom: VALID_FROM,
                validTo: VALID_TO,
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

      describe('transitions from APPROVED', () => {
        let organisation
        let registration1
        let registration2
        let accreditation1
        let accreditation2
        let afterApproval

        beforeEach(async () => {
          // Use existing organisation from fixture (already has 2 registrations and 3 accreditations)
          organisation = buildOrganisation()

          await repository.insert(organisation)
          const inserted = await repository.findById(organisation.id)

          // Link registrations to accreditations and approve both
          const approvedReg1 = {
            ...inserted.registrations[0],
            status: REG_ACC_STATUS.APPROVED,
            registrationNumber: 'REG1',
            validFrom: VALID_FROM,
            validTo: VALID_TO,
            reprocessingType: REPROCESSING_TYPE.INPUT,
            accreditationId: inserted.accreditations[0].id // Link to first accreditation (reprocessor)
          }

          const approvedReg2 = {
            ...inserted.registrations[1],
            status: REG_ACC_STATUS.APPROVED,
            registrationNumber: 'REG2',
            validFrom: VALID_FROM,
            validTo: VALID_TO,
            accreditationId: inserted.accreditations[2].id // Link to third accreditation (exporter)
          }

          // Approve the two accreditations we're linking to
          const approvedAcc1 = {
            ...inserted.accreditations[0],
            status: REG_ACC_STATUS.APPROVED,
            accreditationNumber: 'ACC1',
            validFrom: VALID_FROM,
            validTo: VALID_TO,
            reprocessingType: REPROCESSING_TYPE.INPUT
          }

          const approvedAcc2 = {
            ...inserted.accreditations[2],
            status: REG_ACC_STATUS.APPROVED,
            accreditationNumber: 'ACC2',
            validFrom: VALID_FROM,
            validTo: VALID_TO
          }

          await repository.replace(
            organisation.id,
            1,
            prepareOrgUpdate(inserted, {
              registrations: [approvedReg1, approvedReg2],
              accreditations: [approvedAcc1, approvedAcc2]
            })
          )

          afterApproval = await repository.findById(organisation.id, 2)

          // Store references for tests
          registration1 = afterApproval.registrations[0]
          registration2 = afterApproval.registrations[1]
          accreditation1 = afterApproval.accreditations[0]
          accreditation2 = afterApproval.accreditations[2]

          // Verify initial state - both registrations and accreditations are APPROVED
          assert.strictEqual(registration1.status, REG_ACC_STATUS.APPROVED)
          assert.strictEqual(registration2.status, REG_ACC_STATUS.APPROVED)
          assert.strictEqual(accreditation1.status, REG_ACC_STATUS.APPROVED)
          assert.strictEqual(accreditation2.status, REG_ACC_STATUS.APPROVED)
        })

        it('allows transition from APPROVED to SUSPENDED', async () => {
          // Transition: APPROVED → SUSPENDED
          const suspendedRegistration = {
            ...registration1,
            status: REG_ACC_STATUS.SUSPENDED
          }

          await repository.replace(
            organisation.id,
            2,
            prepareOrgUpdate(afterApproval, {
              registrations: [suspendedRegistration]
            })
          )

          const result = await repository.findById(organisation.id, 3)
          const updatedReg = result.registrations.find(
            (r) => r.id === suspendedRegistration.id
          )

          expect(updatedReg.status).toBe(REG_ACC_STATUS.SUSPENDED)
        })

        it('rejects transition from APPROVED to CANCELLED', async () => {
          const cancelledPayload = prepareOrgUpdate(afterApproval, {
            registrations: [
              {
                ...registration1,
                status: REG_ACC_STATUS.CANCELLED
              }
            ]
          })

          await expect(
            repository.replace(organisation.id, 2, cancelledPayload)
          ).rejects.toMatchObject({
            isBoom: true,
            output: {
              statusCode: 422,
              payload: {
                message: expect.stringContaining(
                  `Cannot transition registration/accreditation status from ${REG_ACC_STATUS.APPROVED} to ${REG_ACC_STATUS.CANCELLED}`
                )
              }
            }
          })
        })

        it('allows transition from SUSPENDED to CANCELLED', async () => {
          // First suspend
          const suspendedRegistration = {
            ...registration1,
            status: REG_ACC_STATUS.SUSPENDED
          }

          await repository.replace(
            organisation.id,
            2,
            prepareOrgUpdate(afterApproval, {
              registrations: [suspendedRegistration]
            })
          )

          // Now cancel
          const cancelledRegistration = {
            ...registration1,
            status: REG_ACC_STATUS.CANCELLED
          }
          await repository.replace(
            organisation.id,
            3,
            prepareOrgUpdate(afterApproval, {
              registrations: [cancelledRegistration]
            })
          )

          const result = await repository.findById(organisation.id, 4)
          const updatedReg = result.registrations.find(
            (r) => r.id === registration1.id
          )

          expect(updatedReg.status).toBe(REG_ACC_STATUS.CANCELLED)
        })

        it('cascades status to linked accreditation when registration moves to SUSPENDED', async () => {
          // Transition registration1: APPROVED → SUSPENDED
          const suspendedRegistration = {
            ...registration1,
            status: REG_ACC_STATUS.SUSPENDED
          }

          await repository.replace(
            organisation.id,
            2,
            prepareOrgUpdate(afterApproval, {
              registrations: [suspendedRegistration]
            })
          )

          const result = await repository.findById(organisation.id, 3)
          const updatedReg1 = result.registrations.find(
            (r) => r.id === suspendedRegistration.id
          )
          const updatedAcc1 = result.accreditations.find(
            (a) => a.id === accreditation1.id
          )
          const updatedReg2 = result.registrations.find(
            (r) => r.id === registration2.id
          )
          const updatedAcc2 = result.accreditations.find(
            (a) => a.id === accreditation2.id
          )

          // Verify registration1 and linked accreditation1 cascaded to SUSPENDED
          expect(updatedReg1.status).toBe(REG_ACC_STATUS.SUSPENDED)
          expect(updatedAcc1.status).toBe(REG_ACC_STATUS.SUSPENDED)

          // Verify registration2 and accreditation2 remain APPROVED
          expect(updatedReg2.status).toBe(REG_ACC_STATUS.APPROVED)
          expect(updatedAcc2.status).toBe(REG_ACC_STATUS.APPROVED)
        })

        it('cascades status to linked accreditation when registration moves to CANCELLED', async () => {
          const suspendedRegistration = {
            ...registration1,
            status: REG_ACC_STATUS.SUSPENDED
          }

          await repository.replace(
            organisation.id,
            2,
            prepareOrgUpdate(afterApproval, {
              registrations: [suspendedRegistration]
            })
          )

          const cancelledRegistration = {
            ...registration1,
            status: REG_ACC_STATUS.CANCELLED
          }

          await repository.replace(
            organisation.id,
            3,
            prepareOrgUpdate(afterApproval, {
              registrations: [cancelledRegistration]
            })
          )

          const result = await repository.findById(organisation.id, 4)
          const finalReg1 = result.registrations.find(
            (r) => r.id === registration1.id
          )
          const finalAcc1 = result.accreditations.find(
            (a) => a.id === accreditation1.id
          )
          const finalReg2 = result.registrations.find(
            (r) => r.id === registration2.id
          )
          const finalAcc2 = result.accreditations.find(
            (a) => a.id === accreditation2.id
          )

          // Verify registration1 and linked accreditation1 cascaded to CANCELLED
          expect(finalReg1.status).toBe(REG_ACC_STATUS.CANCELLED)
          expect(finalAcc1.status).toBe(REG_ACC_STATUS.CANCELLED)

          // Verify registration2 and accreditation2 remain APPROVED
          expect(finalReg2.status).toBe(REG_ACC_STATUS.APPROVED)
          expect(finalAcc2.status).toBe(REG_ACC_STATUS.APPROVED)
        })
      })
    })

    describe('accreditation status transitions', () => {
      describe('transition from CREATED', () => {
        it('rejects transition from CREATED to SUSPENDED', async () => {
          const orgData = buildOrganisation()
          await repository.insert(orgData)

          const updatePayload = prepareOrgUpdate(orgData, {
            accreditations: [
              {
                ...orgData.accreditations[0],
                status: REG_ACC_STATUS.SUSPENDED,
                accreditationNumber: 'ACC12345',
                validFrom: VALID_FROM,
                validTo: VALID_TO,
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

      describe('transition from APPROVED', () => {
        let organisation
        let accreditation
        let afterApproval

        beforeEach(async () => {
          organisation = buildOrganisation()
          await repository.insert(organisation)
          const inserted = await repository.findById(organisation.id)

          // Approve registration and accreditation
          const approvedRegistration = {
            ...inserted.registrations[0],
            status: REG_ACC_STATUS.APPROVED,
            registrationNumber: 'REG12345',
            validFrom: VALID_FROM,
            validTo: VALID_TO,
            reprocessingType: REPROCESSING_TYPE.INPUT
          }

          const approvedAccreditation = {
            ...inserted.accreditations[0],
            status: REG_ACC_STATUS.APPROVED,
            accreditationNumber: 'ACC12345',
            validFrom: VALID_FROM,
            validTo: VALID_TO,
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

          afterApproval = await repository.findById(organisation.id, 2)
          accreditation = afterApproval.accreditations[0]

          // Verify initial state
          assert.strictEqual(accreditation.status, REG_ACC_STATUS.APPROVED)
        })

        it('allows transition from APPROVED to SUSPENDED', async () => {
          const suspendedAccreditation = {
            ...accreditation,
            status: REG_ACC_STATUS.SUSPENDED
          }

          await repository.replace(
            organisation.id,
            2,
            prepareOrgUpdate(afterApproval, {
              accreditations: [suspendedAccreditation]
            })
          )

          const result = await repository.findById(organisation.id, 3)
          const updatedAcc = result.accreditations.find(
            (a) => a.id === accreditation.id
          )

          expect(updatedAcc.status).toBe(REG_ACC_STATUS.SUSPENDED)
        })

        it('rejects transition from APPROVED to CANCELLED', async () => {
          const cancelledPayload = prepareOrgUpdate(afterApproval, {
            accreditations: [
              {
                ...accreditation,
                status: REG_ACC_STATUS.CANCELLED
              }
            ]
          })

          await expect(
            repository.replace(organisation.id, 2, cancelledPayload)
          ).rejects.toMatchObject({
            isBoom: true,
            output: {
              statusCode: 422,
              payload: {
                message: expect.stringContaining(
                  `Cannot transition registration/accreditation status from ${REG_ACC_STATUS.APPROVED} to ${REG_ACC_STATUS.CANCELLED}`
                )
              }
            }
          })
        })

        it('allows transition from SUSPENDED to CANCELLED', async () => {
          // First suspend
          const suspendedAccreditation = {
            ...accreditation,
            status: REG_ACC_STATUS.SUSPENDED
          }

          await repository.replace(
            organisation.id,
            2,
            prepareOrgUpdate(afterApproval, {
              accreditations: [suspendedAccreditation]
            })
          )

          // Now cancel
          const cancelledAccreditation = {
            ...accreditation,
            status: REG_ACC_STATUS.CANCELLED
          }

          await repository.replace(
            organisation.id,
            3,
            prepareOrgUpdate(afterApproval, {
              accreditations: [cancelledAccreditation]
            })
          )

          const result = await repository.findById(organisation.id, 4)
          const updatedAcc = result.accreditations.find(
            (a) => a.id === accreditation.id
          )

          expect(updatedAcc.status).toBe(REG_ACC_STATUS.CANCELLED)
        })
      })
    })
  })
}
