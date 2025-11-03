import { describe, beforeEach, expect } from 'vitest'
import { buildOrganisation } from './test-data.js'
import { STATUS } from '#domain/organisations.js'

export const testUpdateBehaviour = (it) => {
  describe('update', () => {
    let repository

    beforeEach(async ({ organisationsRepository }) => {
      repository = await organisationsRepository()
    })

    describe('basic behaviour', () => {
      it('updates an organisation successfully', async () => {
        const orgData = buildOrganisation()
        await repository.insert(orgData)

        await repository.update(orgData.id, 1, {
          wasteProcessingTypes: ['reprocessor']
        })

        const result = await repository.findById(orgData.id, 2)
        expect(result).toMatchObject({
          id: orgData.id,
          orgId: orgData.orgId,
          wasteProcessingTypes: ['reprocessor'],
          reprocessingNations: orgData.reprocessingNations,
          businessType: orgData.businessType,
          submittedToRegulator: orgData.submittedToRegulator,
          submitterContactDetails: orgData.submitterContactDetails,
          companyDetails: orgData.companyDetails
        })
      })

      it('throws not found error when organisation does not exist', async () => {
        const organisation = buildOrganisation()

        await expect(
          repository.update(organisation.id, 1, {
            wasteProcessingTypes: ['reprocessor']
          })
        ).rejects.toMatchObject({
          isBoom: true,
          output: { statusCode: 404 }
        })
      })

      it('updates registration fields', async () => {
        const organisation = buildOrganisation()
        await repository.insert(organisation)
        const organisationAfterInsert = await repository.findById(
          organisation.id
        )

        const originalReg = organisationAfterInsert.registrations[0]
        const registrationToUpdate = {
          ...originalReg,
          material: 'plastic'
        }
        const beforeUpdateOrg = await repository.findById(organisation.id)

        await repository.update(organisation.id, 1, {
          registrations: [registrationToUpdate]
        })

        const result = await repository.findById(organisation.id, 2)
        const updatedReg = result.registrations.find(
          (r) => r.id === registrationToUpdate.id
        )

        const expectedReg = {
          ...originalReg,
          material: 'plastic'
        }
        expect(updatedReg).toMatchObject(expectedReg)
        expect(result.registrations).toHaveLength(
          organisation.registrations.length
        )
        beforeUpdateOrg.registrations.slice(1).forEach((origReg) => {
          const afterUpdateReg = result.registrations.find(
            (r) => r.id === origReg.id
          )
          expect(afterUpdateReg).toMatchObject(origReg)
        })
      })

      it('updates accreditation fields', async () => {
        const organisation = buildOrganisation()
        await repository.insert(organisation)
        const organisationAfterInsert = await repository.findById(
          organisation.id
        )

        const originalAcc = organisationAfterInsert.accreditations[0]
        const accreditationToUpdate = {
          ...originalAcc,
          material: 'plastic'
        }
        await repository.update(organisation.id, 1, {
          accreditations: [accreditationToUpdate]
        })

        const result = await repository.findById(organisation.id, 2)
        const updatedAcc = result.accreditations.find(
          (a) => a.id === accreditationToUpdate.id
        )

        const expectedAcc = {
          ...originalAcc,
          material: 'plastic'
        }
        expect(updatedAcc).toMatchObject(expectedAcc)

        expect(result.accreditations).toHaveLength(
          organisation.accreditations.length
        )
        organisationAfterInsert.accreditations.slice(1).forEach((origAcc) => {
          const afterUpdateAcc = result.accreditations.find(
            (r) => r.id === origAcc.id
          )
          expect(afterUpdateAcc).toMatchObject(origAcc)
        })
      })

      it('adds new registration via update', async () => {
        const organisation = buildOrganisation()
        await repository.insert(organisation)

        const { ObjectId } = await import('mongodb')
        const newRegistration = {
          ...organisation.registrations[0],
          id: new ObjectId().toString(),
          material: 'steel'
        }
        delete newRegistration.statusHistory

        await repository.update(organisation.id, 1, {
          registrations: [newRegistration]
        })

        const result = await repository.findById(organisation.id, 2)

        expect(result.registrations).toHaveLength(
          organisation.registrations.length + 1
        )
        expect(result.accreditations.length).toBe(
          organisation.accreditations.length
        )

        const addedReg = result.registrations.find(
          (r) => r.id === newRegistration.id
        )
        expect(addedReg).toBeDefined()

        const { statusHistory, ...expectedReg } = {
          ...newRegistration,
          formSubmissionTime: new Date(newRegistration.formSubmissionTime)
        }
        const { statusHistory: actualStatusHistory, ...actualReg } = addedReg

        expect(actualReg).toMatchObject(expectedReg)
        expect(actualStatusHistory).toHaveLength(1)
        expect(actualStatusHistory[0].status).toBe(STATUS.CREATED)
      })

      it('adds new accreditation via update', async () => {
        const organisation = buildOrganisation()
        await repository.insert(organisation)

        const { ObjectId } = await import('mongodb')
        const newAccreditation = {
          ...organisation.accreditations[0],
          id: new ObjectId().toString(),
          material: 'aluminium'
        }
        delete newAccreditation.statusHistory

        await repository.update(organisation.id, 1, {
          accreditations: [newAccreditation]
        })

        const result = await repository.findById(organisation.id, 2)

        expect(result.accreditations).toHaveLength(
          organisation.accreditations.length + 1
        )
        const addedAcc = result.accreditations.find(
          (a) => a.id === newAccreditation.id
        )
        expect(addedAcc).toBeDefined()

        const { statusHistory, ...expectedAcc } = {
          ...newAccreditation,
          formSubmissionTime: new Date(newAccreditation.formSubmissionTime)
        }
        const { statusHistory: actualStatusHistory, ...actualAcc } = addedAcc
        expect(actualAcc).toMatchObject(expectedAcc)
        expect(actualStatusHistory).toHaveLength(1)
        expect(actualStatusHistory[0].status).toBe(STATUS.CREATED)
      })
    })

    describe('optimistic concurrency control', () => {
      it('throws conflict error when version does not match', async () => {
        const organisation = buildOrganisation()
        await repository.insert(organisation)

        await expect(
          repository.update(organisation.id, 2, {
            wasteProcessingTypes: ['exporter']
          })
        ).rejects.toMatchObject({
          isBoom: true,
          output: { statusCode: 409 }
        })
      })

      it('prevents lost updates in concurrent scenarios', async () => {
        const organisation = buildOrganisation()
        await repository.insert(organisation)

        await repository.update(organisation.id, 1, {
          wasteProcessingTypes: ['exporter']
        })

        await expect(
          repository.update(organisation.id, 1, {
            reprocessingNations: ['wales']
          })
        ).rejects.toMatchObject({
          isBoom: true,
          output: { statusCode: 409 }
        })

        const result = await repository.findById(organisation.id, 2)
        expect(result.version).toBe(2)
        expect(result.wasteProcessingTypes).toEqual(['exporter'])
        expect(result.reprocessingNations).toEqual(
          organisation.reprocessingNations
        )
      })
    })

    describe('statusHistory handling', () => {
      it('adds new statusHistory entry when organisation status changes', async () => {
        const organisation = buildOrganisation()
        await repository.insert(organisation)

        await repository.update(organisation.id, 1, {
          status: STATUS.APPROVED
        })

        const result = await repository.findById(organisation.id, 2)
        expect(result.status).toBe(STATUS.APPROVED)
        expect(result.statusHistory).toHaveLength(2)
        expect(result.statusHistory[0].status).toBe(STATUS.CREATED)
        expect(result.statusHistory[1].status).toBe(STATUS.APPROVED)
        expect(result.statusHistory[1].updatedAt).toBeInstanceOf(Date)
      })

      it('does not modify statusHistory when organisation status is not changed', async () => {
        const organisation = buildOrganisation()
        await repository.insert(organisation)

        await repository.update(organisation.id, 1, {
          wasteProcessingTypes: ['exporter']
        })

        const result = await repository.findById(organisation.id, 2)
        expect(result.status).toBe(STATUS.CREATED)
        expect(result.statusHistory).toHaveLength(1)
        expect(result.statusHistory[0].status).toBe(STATUS.CREATED)
      })

      it('preserves all existing statusHistory entries when organisation status changes', async () => {
        const organisation = buildOrganisation()
        await repository.insert(organisation)

        await repository.update(organisation.id, 1, { status: STATUS.APPROVED })
        await repository.update(organisation.id, 2, { status: STATUS.REJECTED })
        await repository.update(organisation.id, 3, {
          status: STATUS.SUSPENDED
        })

        const result = await repository.findById(organisation.id, 4)
        expect(result.status).toBe(STATUS.SUSPENDED)
        expect(result.statusHistory).toHaveLength(4)
        expect(result.statusHistory[0].status).toBe(STATUS.CREATED)
        expect(result.statusHistory[1].status).toBe(STATUS.APPROVED)
        expect(result.statusHistory[2].status).toBe(STATUS.REJECTED)
        expect(result.statusHistory[3].status).toBe(STATUS.SUSPENDED)
      })

      it('adds new statusHistory entry to registration when status changes', async () => {
        const organisation = buildOrganisation()
        await repository.insert(organisation)

        const registrationToUpdate = {
          ...organisation.registrations[0],
          status: STATUS.APPROVED
        }
        await repository.update(organisation.id, 1, {
          registrations: [registrationToUpdate]
        })

        const result = await repository.findById(organisation.id, 2)
        const updatedReg = result.registrations.find(
          (r) => r.id === registrationToUpdate.id
        )
        expect(updatedReg.status).toBe(STATUS.APPROVED)
        expect(updatedReg.statusHistory).toHaveLength(2)
        expect(updatedReg.statusHistory[0].status).toBe(STATUS.CREATED)
        expect(updatedReg.statusHistory[1].status).toBe(STATUS.APPROVED)
        expect(updatedReg.statusHistory[1].updatedAt).toBeInstanceOf(Date)
      })

      it('preserves all existing statusHistory entries for registration', async () => {
        const organisation = buildOrganisation()
        await repository.insert(organisation)

        const regId = organisation.registrations[0].id

        await repository.update(organisation.id, 1, {
          registrations: [
            { ...organisation.registrations[0], status: STATUS.APPROVED }
          ]
        })
        await repository.update(organisation.id, 2, {
          registrations: [
            { ...organisation.registrations[0], status: STATUS.REJECTED }
          ]
        })

        const result = await repository.findById(organisation.id, 3)
        const updatedReg = result.registrations.find((r) => r.id === regId)
        expect(updatedReg.status).toBe(STATUS.REJECTED)
        expect(updatedReg.statusHistory).toHaveLength(3)
        expect(updatedReg.statusHistory[0].status).toBe(STATUS.CREATED)
        expect(updatedReg.statusHistory[1].status).toBe(STATUS.APPROVED)
        expect(updatedReg.statusHistory[2].status).toBe(STATUS.REJECTED)
      })

      it('adds new statusHistory entry to accreditation when status changes', async () => {
        const organisation = buildOrganisation()
        await repository.insert(organisation)

        const accreditationToUpdate = {
          ...organisation.accreditations[0],
          status: STATUS.APPROVED
        }
        await repository.update(organisation.id, 1, {
          accreditations: [accreditationToUpdate]
        })

        const result = await repository.findById(organisation.id, 2)
        const updatedAcc = result.accreditations.find(
          (a) => a.id === accreditationToUpdate.id
        )
        expect(updatedAcc.status).toBe(STATUS.APPROVED)
        expect(updatedAcc.statusHistory).toHaveLength(2)
        expect(updatedAcc.statusHistory[0].status).toBe(STATUS.CREATED)
        expect(updatedAcc.statusHistory[1].status).toBe(STATUS.APPROVED)
        expect(updatedAcc.statusHistory[1].updatedAt).toBeInstanceOf(Date)
      })

      it('preserves all existing statusHistory entries for accreditation', async () => {
        const organisation = buildOrganisation()
        await repository.insert(organisation)

        const accId = organisation.accreditations[0].id

        await repository.update(organisation.id, 1, {
          accreditations: [
            { ...organisation.accreditations[0], status: STATUS.APPROVED }
          ]
        })
        await repository.update(organisation.id, 2, {
          accreditations: [
            { ...organisation.accreditations[0], status: STATUS.SUSPENDED }
          ]
        })

        const result = await repository.findById(organisation.id, 3)
        const updatedAcc = result.accreditations.find((a) => a.id === accId)
        expect(updatedAcc.status).toBe(STATUS.SUSPENDED)
        expect(updatedAcc.statusHistory).toHaveLength(3)
        expect(updatedAcc.statusHistory[0].status).toBe(STATUS.CREATED)
        expect(updatedAcc.statusHistory[1].status).toBe(STATUS.APPROVED)
        expect(updatedAcc.statusHistory[2].status).toBe(STATUS.SUSPENDED)
      })

      it('rejects invalid status value', async () => {
        const organisation = buildOrganisation()
        await repository.insert(organisation)

        await expect(
          repository.update(organisation.id, 1, {
            status: 'invalid'
          })
        ).rejects.toThrow(/Invalid organisation data/)
      })
    })

    describe('non-updatable fields validation', () => {
      it('rejects updates to id field', async () => {
        const organisation = buildOrganisation()
        await repository.insert(organisation)

        const newId = buildOrganisation().id

        await expect(
          repository.update(organisation.id, 1, {
            id: newId,
            wasteProcessingTypes: ['exporter']
          })
        ).rejects.toThrow(/Invalid organisation data.*id.*not allowed/)
      })

      it('rejects updates to version field', async () => {
        const organisation = buildOrganisation()
        await repository.insert(organisation)

        await expect(
          repository.update(organisation.id, 1, {
            version: 99,
            wasteProcessingTypes: ['exporter']
          })
        ).rejects.toThrow(/Invalid organisation data.*version.*not allowed/)
      })

      it('rejects updates to schemaVersion field', async () => {
        const organisation = buildOrganisation()
        await repository.insert(organisation)

        await expect(
          repository.update(organisation.id, 1, {
            schemaVersion: 99,
            wasteProcessingTypes: ['exporter']
          })
        ).rejects.toThrow(
          /Invalid organisation data.*schemaVersion.*not allowed/
        )
      })
    })
  })
}
