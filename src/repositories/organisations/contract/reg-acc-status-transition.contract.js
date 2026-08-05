import assert from 'node:assert'
import {
  ACCREDITATION_STATUS,
  REGISTRATION_STATUS,
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

    beforeEach(
      async (
        /** @type {{ organisationsRepository: import("../port.js").OrganisationsRepositoryFactory }} */ {
          organisationsRepository
        }
      ) => {
        repository = await organisationsRepository()
      }
    )

    describe('registration status transitions', () => {
      describe('transitions from CREATED', () => {
        it('rejects transition from CREATED to SUSPENDED', async () => {
          const orgData = buildOrganisation()
          await repository.insert(orgData)

          const updatePayload = prepareOrgUpdate(orgData, {
            registrations: [
              {
                ...orgData.registrations[0],
                status: ACCREDITATION_STATUS.SUSPENDED,
                registrationNumber: 'REG12345',
                validFrom: VALID_FROM,
                validTo: VALID_TO,
                reprocessingType: REPROCESSING_TYPE.INPUT
              }
            ],
            accreditations: [
              {
                ...orgData.accreditations[0],
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
                // suspended is no longer an allowed registration status, so
                // the schema rejects it before the transition table is consulted
                message: expect.stringMatching(
                  /Invalid organisation data: registrations\.0\.status/
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
            status: REGISTRATION_STATUS.APPROVED,
            registrationNumber: 'REG1',
            validFrom: VALID_FROM,
            validTo: VALID_TO,
            reprocessingType: REPROCESSING_TYPE.INPUT,
            accreditationId: inserted.accreditations[0].id // Link to first accreditation (reprocessor)
          }

          const approvedReg2 = {
            ...inserted.registrations[1],
            status: REGISTRATION_STATUS.APPROVED,
            registrationNumber: 'REG2',
            validFrom: VALID_FROM,
            validTo: VALID_TO,
            accreditationId: inserted.accreditations[2].id // Link to third accreditation (exporter)
          }

          // Approve the two accreditations we're linking to
          const approvedAcc1 = {
            ...inserted.accreditations[0],
            status: ACCREDITATION_STATUS.APPROVED,
            accreditationNumber: 'ACC1',
            validFrom: VALID_FROM,
            validTo: VALID_TO,
            reprocessingType: REPROCESSING_TYPE.INPUT
          }

          const approvedAcc2 = {
            ...inserted.accreditations[2],
            status: ACCREDITATION_STATUS.APPROVED,
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
          assert.strictEqual(registration1.status, REGISTRATION_STATUS.APPROVED)
          assert.strictEqual(registration2.status, REGISTRATION_STATUS.APPROVED)
          assert.strictEqual(
            accreditation1.status,
            ACCREDITATION_STATUS.APPROVED
          )
          assert.strictEqual(
            accreditation2.status,
            ACCREDITATION_STATUS.APPROVED
          )
        })

        it('rejects transition from APPROVED to SUSPENDED (registrations cannot be suspended)', async () => {
          const suspendedPayload = prepareOrgUpdate(afterApproval, {
            registrations: [
              {
                ...registration1,
                status: ACCREDITATION_STATUS.SUSPENDED
              }
            ]
          })

          await expect(
            repository.replace(organisation.id, 2, suspendedPayload)
          ).rejects.toMatchObject({
            isBoom: true,
            output: {
              statusCode: 422,
              payload: {
                // suspended is no longer an allowed registration status, so
                // the schema rejects it before the transition table is consulted
                message: expect.stringMatching(
                  /Invalid organisation data: registrations\.0\.status/
                )
              }
            }
          })

          // The registration and its linked accreditation are untouched
          const result = await repository.findById(organisation.id, 2)
          const unchangedReg = result.registrations.find(
            (r) => r.id === registration1.id
          )
          const unchangedAcc = result.accreditations.find(
            (a) => a.id === accreditation1.id
          )
          expect(unchangedReg.status).toBe(REGISTRATION_STATUS.APPROVED)
          expect(unchangedAcc.status).toBe(ACCREDITATION_STATUS.APPROVED)
        })

        it('allows direct transition from APPROVED to CANCELLED', async () => {
          const cancelledPayload = prepareOrgUpdate(afterApproval, {
            registrations: [
              {
                ...registration1,
                status: REGISTRATION_STATUS.CANCELLED
              }
            ]
          })

          await repository.replace(organisation.id, 2, cancelledPayload)

          const result = await repository.findById(organisation.id, 3)
          const updatedReg = result.registrations.find(
            (r) => r.id === registration1.id
          )

          expect(updatedReg.status).toBe(REGISTRATION_STATUS.CANCELLED)
        })

        it('force-cancels the linked APPROVED accreditation when the registration is cancelled', async () => {
          const cancelledRegistration = {
            ...registration1,
            status: REGISTRATION_STATUS.CANCELLED
          }

          await repository.replace(
            organisation.id,
            2,
            prepareOrgUpdate(afterApproval, {
              registrations: [cancelledRegistration]
            })
          )

          const result = await repository.findById(organisation.id, 3)
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

          // The accreditation is force-cancelled from APPROVED — the cascade
          // bypasses the accreditation's suspended-first rule (Scenario 5)
          expect(finalReg1.status).toBe(REGISTRATION_STATUS.CANCELLED)
          expect(finalAcc1.status).toBe(ACCREDITATION_STATUS.CANCELLED)
          expect(finalAcc1.statusHistory.at(-1)).toMatchObject({
            status: ACCREDITATION_STATUS.CANCELLED
          })

          // Verify registration2 and accreditation2 remain APPROVED
          expect(finalReg2.status).toBe(REGISTRATION_STATUS.APPROVED)
          expect(finalAcc2.status).toBe(ACCREDITATION_STATUS.APPROVED)
        })

        it('cascades cancellation to the linked SUSPENDED accreditation when the registration is cancelled', async () => {
          // Suspend the accreditation directly (suspension is an
          // accreditation-only concept)
          await repository.replace(
            organisation.id,
            2,
            prepareOrgUpdate(afterApproval, {
              accreditations: [
                { ...accreditation1, status: ACCREDITATION_STATUS.SUSPENDED }
              ]
            })
          )

          const afterSuspension = await repository.findById(organisation.id, 3)

          await repository.replace(
            organisation.id,
            3,
            prepareOrgUpdate(afterSuspension, {
              registrations: [
                { ...registration1, status: REGISTRATION_STATUS.CANCELLED }
              ]
            })
          )

          const result = await repository.findById(organisation.id, 4)
          const finalReg1 = result.registrations.find(
            (r) => r.id === registration1.id
          )
          const finalAcc1 = result.accreditations.find(
            (a) => a.id === accreditation1.id
          )

          expect(finalReg1.status).toBe(REGISTRATION_STATUS.CANCELLED)
          expect(finalAcc1.status).toBe(ACCREDITATION_STATUS.CANCELLED)
        })

        it('allows transition from CANCELLED to APPROVED (reinstatement)', async () => {
          // Cancel directly
          await repository.replace(
            organisation.id,
            2,
            prepareOrgUpdate(afterApproval, {
              registrations: [
                { ...registration1, status: REGISTRATION_STATUS.CANCELLED }
              ]
            })
          )

          // Reinstate
          const afterCancellation = await repository.findById(
            organisation.id,
            3
          )
          const cancelledReg = afterCancellation.registrations.find(
            (r) => r.id === registration1.id
          )

          await repository.replace(
            organisation.id,
            3,
            prepareOrgUpdate(afterCancellation, {
              registrations: [
                { ...cancelledReg, status: REGISTRATION_STATUS.APPROVED }
              ]
            })
          )

          const result = await repository.findById(organisation.id, 4)
          const reinstatedReg = result.registrations.find(
            (r) => r.id === registration1.id
          )

          expect(reinstatedReg.status).toBe(REGISTRATION_STATUS.APPROVED)
        })

        it('leaves a CREATED linked accreditation untouched when the registration is cancelled', async () => {
          // A registration can be approved while its accreditation application
          // is still pending — the cascade must not cancel a never-live
          // accreditation
          const orgData = buildOrganisation()
          await repository.insert(orgData)
          const inserted = await repository.findById(orgData.id)

          const approvedReg = {
            ...inserted.registrations[0],
            status: REGISTRATION_STATUS.APPROVED,
            registrationNumber: 'REG12345',
            validFrom: VALID_FROM,
            validTo: VALID_TO,
            reprocessingType: REPROCESSING_TYPE.INPUT,
            accreditationId: inserted.accreditations[0].id
          }

          await repository.replace(
            orgData.id,
            1,
            prepareOrgUpdate(inserted, {
              registrations: [approvedReg],
              accreditations: [
                {
                  ...inserted.accreditations[0],
                  reprocessingType: REPROCESSING_TYPE.INPUT
                }
              ]
            })
          )

          const afterApprovalOfReg = await repository.findById(orgData.id, 2)
          const linkedReg = afterApprovalOfReg.registrations[0]
          assert.strictEqual(
            afterApprovalOfReg.accreditations[0].status,
            ACCREDITATION_STATUS.CREATED
          )

          await repository.replace(
            orgData.id,
            2,
            prepareOrgUpdate(afterApprovalOfReg, {
              registrations: [
                { ...linkedReg, status: REGISTRATION_STATUS.CANCELLED }
              ]
            })
          )

          const result = await repository.findById(orgData.id, 3)
          const untouchedAcc = result.accreditations.find(
            (a) => a.id === inserted.accreditations[0].id
          )

          expect(untouchedAcc.status).toBe(ACCREDITATION_STATUS.CREATED)
          expect(untouchedAcc.statusHistory.map((h) => h.status)).not.toContain(
            ACCREDITATION_STATUS.CANCELLED
          )
        })

        it('does not reinstate the cascade-cancelled accreditation when the registration is reinstated', async () => {
          // Cancel directly — the cancellation force-cancels accreditation1
          await repository.replace(
            organisation.id,
            2,
            prepareOrgUpdate(afterApproval, {
              registrations: [
                { ...registration1, status: REGISTRATION_STATUS.CANCELLED }
              ]
            })
          )

          // Reinstate the registration only
          const afterCancellation = await repository.findById(
            organisation.id,
            3
          )
          const cancelledReg = afterCancellation.registrations.find(
            (r) => r.id === registration1.id
          )

          await repository.replace(
            organisation.id,
            3,
            prepareOrgUpdate(afterCancellation, {
              registrations: [
                { ...cancelledReg, status: REGISTRATION_STATUS.APPROVED }
              ]
            })
          )

          const result = await repository.findById(organisation.id, 4)
          const reinstatedReg = result.registrations.find(
            (r) => r.id === registration1.id
          )
          const linkedAcc = result.accreditations.find(
            (a) => a.id === accreditation1.id
          )

          expect(reinstatedReg.status).toBe(REGISTRATION_STATUS.APPROVED)
          expect(linkedAcc.status).toBe(ACCREDITATION_STATUS.CANCELLED)
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
                status: ACCREDITATION_STATUS.SUSPENDED,
                accreditationNumber: 'ACC12345',
                validFrom: VALID_FROM,
                validTo: VALID_TO,
                reprocessingType: REPROCESSING_TYPE.INPUT
              }
            ],
            registrations: [
              {
                ...orgData.registrations[0],
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
                  `Cannot transition accreditation status from ${ACCREDITATION_STATUS.CREATED} to ${ACCREDITATION_STATUS.SUSPENDED}`
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
            status: REGISTRATION_STATUS.APPROVED,
            registrationNumber: 'REG12345',
            validFrom: VALID_FROM,
            validTo: VALID_TO,
            reprocessingType: REPROCESSING_TYPE.INPUT
          }

          const approvedAccreditation = {
            ...inserted.accreditations[0],
            status: ACCREDITATION_STATUS.APPROVED,
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
          assert.strictEqual(
            accreditation.status,
            ACCREDITATION_STATUS.APPROVED
          )
        })

        it('allows transition from APPROVED to SUSPENDED', async () => {
          const suspendedAccreditation = {
            ...accreditation,
            status: ACCREDITATION_STATUS.SUSPENDED
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

          expect(updatedAcc.status).toBe(ACCREDITATION_STATUS.SUSPENDED)
        })

        it('rejects transition from APPROVED to CANCELLED', async () => {
          const cancelledPayload = prepareOrgUpdate(afterApproval, {
            accreditations: [
              {
                ...accreditation,
                status: ACCREDITATION_STATUS.CANCELLED
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
                  `Cannot transition accreditation status from ${ACCREDITATION_STATUS.APPROVED} to ${ACCREDITATION_STATUS.CANCELLED}`
                )
              }
            }
          })
        })

        it('allows transition from SUSPENDED to CANCELLED', async () => {
          // First suspend
          const suspendedAccreditation = {
            ...accreditation,
            status: ACCREDITATION_STATUS.SUSPENDED
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
            status: ACCREDITATION_STATUS.CANCELLED
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

          expect(updatedAcc.status).toBe(ACCREDITATION_STATUS.CANCELLED)
        })

        it('allows transition from CANCELLED to APPROVED (reinstatement)', async () => {
          // Suspend then cancel the accreditation; the registration stays approved
          await repository.replace(
            organisation.id,
            2,
            prepareOrgUpdate(afterApproval, {
              accreditations: [
                { ...accreditation, status: ACCREDITATION_STATUS.SUSPENDED }
              ]
            })
          )
          await repository.replace(
            organisation.id,
            3,
            prepareOrgUpdate(afterApproval, {
              accreditations: [
                { ...accreditation, status: ACCREDITATION_STATUS.CANCELLED }
              ]
            })
          )

          // Reinstate
          const afterCancellation = await repository.findById(
            organisation.id,
            4
          )
          const cancelledAcc = afterCancellation.accreditations.find(
            (a) => a.id === accreditation.id
          )

          await repository.replace(
            organisation.id,
            4,
            prepareOrgUpdate(afterCancellation, {
              accreditations: [
                { ...cancelledAcc, status: ACCREDITATION_STATUS.APPROVED }
              ]
            })
          )

          const result = await repository.findById(organisation.id, 5)
          const reinstatedAcc = result.accreditations.find(
            (a) => a.id === accreditation.id
          )

          expect(reinstatedAcc.status).toBe(ACCREDITATION_STATUS.APPROVED)
        })

        it('keeps the accreditation CANCELLED when reinstatement is attempted while the linked registration is cancelled', async () => {
          // Cancel the registration; the cancellation cascades to the accreditation
          const registration = afterApproval.registrations[0]

          await repository.replace(
            organisation.id,
            2,
            prepareOrgUpdate(afterApproval, {
              registrations: [
                { ...registration, status: REGISTRATION_STATUS.CANCELLED }
              ]
            })
          )

          // Attempt to reinstate the accreditation while the registration is
          // cancelled — the cascade re-applies the registration status, so the
          // accreditation is held at CANCELLED
          const afterCancellation = await repository.findById(
            organisation.id,
            3
          )
          const cancelledAcc = afterCancellation.accreditations.find(
            (a) => a.id === accreditation.id
          )

          await repository.replace(
            organisation.id,
            3,
            prepareOrgUpdate(afterCancellation, {
              accreditations: [
                { ...cancelledAcc, status: ACCREDITATION_STATUS.APPROVED }
              ]
            })
          )

          const result = await repository.findById(organisation.id, 4)
          const heldAcc = result.accreditations.find(
            (a) => a.id === accreditation.id
          )

          expect(heldAcc.status).toBe(ACCREDITATION_STATUS.CANCELLED)
        })

        it('rejects transition from CANCELLED to APPROVED when no approved registration is linked', async () => {
          // Suspend then cancel the accreditation, then revert the
          // registration to created (no cascade applies from created)
          await repository.replace(
            organisation.id,
            2,
            prepareOrgUpdate(afterApproval, {
              accreditations: [
                { ...accreditation, status: ACCREDITATION_STATUS.SUSPENDED }
              ]
            })
          )
          await repository.replace(
            organisation.id,
            3,
            prepareOrgUpdate(afterApproval, {
              accreditations: [
                { ...accreditation, status: ACCREDITATION_STATUS.CANCELLED }
              ]
            })
          )

          const afterAccCancellation = await repository.findById(
            organisation.id,
            4
          )
          const registration = afterAccCancellation.registrations[0]
          await repository.replace(
            organisation.id,
            4,
            prepareOrgUpdate(afterAccCancellation, {
              registrations: [
                { ...registration, status: REGISTRATION_STATUS.CREATED }
              ]
            })
          )

          // Attempt to reinstate the accreditation with no approved registration
          const afterRevert = await repository.findById(organisation.id, 5)
          const cancelledAcc = afterRevert.accreditations.find(
            (a) => a.id === accreditation.id
          )

          await expect(
            repository.replace(
              organisation.id,
              5,
              prepareOrgUpdate(afterRevert, {
                accreditations: [
                  { ...cancelledAcc, status: ACCREDITATION_STATUS.APPROVED }
                ]
              })
            )
          ).rejects.toMatchObject({
            isBoom: true,
            output: {
              statusCode: 422,
              payload: {
                message: expect.stringContaining(
                  'approved but not linked to an approved registration'
                )
              }
            }
          })
        })
      })
    })
  })
}
