import { describe, beforeEach, expect } from 'vitest'
import { buildOrganisation } from './test-data.js'
import { STATUS } from '#domain/organisations/model.js'

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
          status: STATUS.APPROVED,
          registrationNumber: 'REG12345',
          validFrom: new Date('2025-01-01'),
          validTo: new Date('2025-12-31')
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
            {
              ...organisation.registrations[0],
              status: STATUS.APPROVED,
              registrationNumber: 'REG12345',
              validFrom: new Date('2025-01-01'),
              validTo: new Date('2025-12-31')
            }
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
          status: STATUS.APPROVED,
          accreditationNumber: 'ACC12345',
          validFrom: new Date('2025-01-01'),
          validTo: new Date('2025-12-31')
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
            {
              ...organisation.accreditations[0],
              status: STATUS.APPROVED,
              accreditationNumber: 'ACC12345',
              validFrom: new Date('2025-01-01'),
              validTo: new Date('2025-12-31')
            }
          ]
        })
        await repository.update(organisation.id, 2, {
          accreditations: [
            {
              ...organisation.accreditations[0],
              status: STATUS.SUSPENDED,
              accreditationNumber: 'ACC12345',
              validFrom: new Date('2025-01-01'),
              validTo: new Date('2025-12-31')
            }
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
        ).rejects.toThrow('Invalid organisation data: status: any.only')
      })
    })

    describe('conditional field validation', () => {
      describe('registrationNumber', () => {
        it('rejects update when registration status changes to approved without registrationNumber', async () => {
          const organisation = buildOrganisation()
          await repository.insert(organisation)

          const registrationToUpdate = {
            ...organisation.registrations[0],
            status: STATUS.APPROVED,
            registrationNumber: undefined,
            validFrom: new Date('2025-01-01'),
            validTo: new Date('2025-12-31')
          }

          await expect(
            repository.update(organisation.id, 1, {
              registrations: [registrationToUpdate]
            })
          ).rejects.toThrow(
            'Invalid organisation data: registrations.0.registrationNumber: any.required'
          )
        })

        it('allows update when registration status changes to approved with registrationNumber', async () => {
          const organisation = buildOrganisation()
          await repository.insert(organisation)

          const registrationToUpdate = {
            ...organisation.registrations[0],
            status: STATUS.APPROVED,
            registrationNumber: 'REG12345',
            validFrom: new Date('2025-01-01'),
            validTo: new Date('2025-12-31')
          }

          await repository.update(organisation.id, 1, {
            registrations: [registrationToUpdate]
          })

          const result = await repository.findById(organisation.id, 2)
          const updatedReg = result.registrations.find(
            (r) => r.id === registrationToUpdate.id
          )

          expect(updatedReg.status).toBe(STATUS.APPROVED)
          expect(updatedReg.registrationNumber).toBe('REG12345')
        })

        it('rejects update when registration status changes to suspended without registrationNumber', async () => {
          const organisation = buildOrganisation()
          await repository.insert(organisation)

          const registrationToUpdate = {
            ...organisation.registrations[0],
            status: STATUS.SUSPENDED,
            registrationNumber: undefined,
            validFrom: new Date('2025-01-01'),
            validTo: new Date('2025-12-31')
          }

          await expect(
            repository.update(organisation.id, 1, {
              registrations: [registrationToUpdate]
            })
          ).rejects.toThrow(
            'Invalid organisation data: registrations.0.registrationNumber: any.required'
          )
        })

        it('allows update when registration status is not approved or suspended without wasteRegistrationNumber', async () => {
          const organisation = buildOrganisation()
          await repository.insert(organisation)

          const registrationToUpdate = {
            ...organisation.registrations[0],
            material: 'plastic',
            wasteRegistrationNumber: undefined
          }

          await repository.update(organisation.id, 1, {
            registrations: [registrationToUpdate]
          })

          const result = await repository.findById(organisation.id, 2)
          const updatedReg = result.registrations.find(
            (r) => r.id === registrationToUpdate.id
          )

          expect(updatedReg.material).toBe('plastic')
          expect(
            updatedReg.wasteRegistrationNumber === null ||
              updatedReg.wasteRegistrationNumber === undefined
          ).toBe(true)
        })
      })

      describe('accreditationNumber', () => {
        it('rejects update when accreditation status changes to approved without accreditationNumber', async () => {
          const organisation = buildOrganisation()
          await repository.insert(organisation)

          const accreditationToUpdate = {
            ...organisation.accreditations[0],
            status: STATUS.APPROVED,
            accreditationNumber: undefined,
            validFrom: new Date('2025-01-01'),
            validTo: new Date('2025-12-31')
          }

          await expect(
            repository.update(organisation.id, 1, {
              accreditations: [accreditationToUpdate]
            })
          ).rejects.toThrow(
            'Invalid organisation data: accreditations.0.accreditationNumber: any.required'
          )
        })

        it('allows update when accreditation status changes to approved with accreditationNumber', async () => {
          const organisation = buildOrganisation()
          await repository.insert(organisation)

          const accreditationToUpdate = {
            ...organisation.accreditations[0],
            status: STATUS.APPROVED,
            accreditationNumber: 'ACC12345',
            validFrom: new Date('2025-01-01'),
            validTo: new Date('2025-12-31')
          }

          await repository.update(organisation.id, 1, {
            accreditations: [accreditationToUpdate]
          })

          const result = await repository.findById(organisation.id, 2)
          const updatedAcc = result.accreditations.find(
            (a) => a.id === accreditationToUpdate.id
          )

          expect(updatedAcc.status).toBe(STATUS.APPROVED)
          expect(updatedAcc.accreditationNumber).toBe('ACC12345')
        })

        it('rejects update when accreditation status changes to suspended without accreditationNumber', async () => {
          const organisation = buildOrganisation()
          await repository.insert(organisation)

          const accreditationToUpdate = {
            ...organisation.accreditations[0],
            status: STATUS.SUSPENDED,
            accreditationNumber: undefined,
            validFrom: new Date('2025-01-01'),
            validTo: new Date('2025-12-31')
          }

          await expect(
            repository.update(organisation.id, 1, {
              accreditations: [accreditationToUpdate]
            })
          ).rejects.toThrow(
            'Invalid organisation data: accreditations.0.accreditationNumber: any.required'
          )
        })

        it('allows update when accreditation status changes to suspended with accreditationNumber', async () => {
          const organisation = buildOrganisation()
          await repository.insert(organisation)

          const accreditationToUpdate = {
            ...organisation.accreditations[0],
            status: STATUS.SUSPENDED,
            accreditationNumber: 'ACC12345',
            validFrom: new Date('2025-01-01'),
            validTo: new Date('2025-12-31')
          }

          await repository.update(organisation.id, 1, {
            accreditations: [accreditationToUpdate]
          })

          const result = await repository.findById(organisation.id, 2)
          const updatedAcc = result.accreditations.find(
            (a) => a.id === accreditationToUpdate.id
          )

          expect(updatedAcc.status).toBe(STATUS.SUSPENDED)
          expect(updatedAcc.accreditationNumber).toBe('ACC12345')
        })

        it('allows update when accreditation status is not approved or suspended without accreditationNumber', async () => {
          const organisation = buildOrganisation()
          await repository.insert(organisation)

          const accreditationToUpdate = {
            ...organisation.accreditations[0],
            material: 'plastic',
            accreditationNumber: undefined
          }

          await repository.update(organisation.id, 1, {
            accreditations: [accreditationToUpdate]
          })

          const result = await repository.findById(organisation.id, 2)
          const updatedAcc = result.accreditations.find(
            (a) => a.id === accreditationToUpdate.id
          )

          expect(updatedAcc.material).toBe('plastic')
          expect(
            updatedAcc.accreditationNumber === null ||
              updatedAcc.accreditationNumber === undefined
          ).toBe(true)
        })
      })

      describe('validFrom and validTo for registrations', () => {
        it('rejects update when registration status changes to approved without validFrom', async () => {
          const organisation = buildOrganisation()
          await repository.insert(organisation)

          const registrationToUpdate = {
            ...organisation.registrations[0],
            status: STATUS.APPROVED,
            registrationNumber: 'REG12345',
            validFrom: undefined,
            validTo: new Date('2025-12-31')
          }

          await expect(
            repository.update(organisation.id, 1, {
              registrations: [registrationToUpdate]
            })
          ).rejects.toThrow(
            'Invalid organisation data: registrations.0.validFrom: any.required'
          )
        })

        it('rejects update when registration status changes to approved without validTo', async () => {
          const organisation = buildOrganisation()
          await repository.insert(organisation)

          const registrationToUpdate = {
            ...organisation.registrations[0],
            status: STATUS.APPROVED,
            registrationNumber: 'REG12345',
            validFrom: new Date('2025-01-01'),
            validTo: undefined
          }

          await expect(
            repository.update(organisation.id, 1, {
              registrations: [registrationToUpdate]
            })
          ).rejects.toThrow(
            'Invalid organisation data: registrations.0.validTo: any.required'
          )
        })

        it('allows update when registration status changes to approved with validFrom and validTo', async () => {
          const organisation = buildOrganisation()
          await repository.insert(organisation)

          const validFrom = new Date('2025-01-01')
          const validTo = new Date('2025-12-31')

          const registrationToUpdate = {
            ...organisation.registrations[0],
            status: STATUS.APPROVED,
            registrationNumber: 'REG12345',
            validFrom,
            validTo
          }

          await repository.update(organisation.id, 1, {
            registrations: [registrationToUpdate]
          })

          const result = await repository.findById(organisation.id, 2)
          const updatedReg = result.registrations.find(
            (r) => r.id === registrationToUpdate.id
          )

          expect(updatedReg.status).toBe(STATUS.APPROVED)
          expect(updatedReg.validFrom).toEqual(validFrom)
          expect(updatedReg.validTo).toEqual(validTo)
        })

        it('rejects update when registration status changes to suspended without validFrom', async () => {
          const organisation = buildOrganisation()
          await repository.insert(organisation)

          const registrationToUpdate = {
            ...organisation.registrations[0],
            status: STATUS.SUSPENDED,
            registrationNumber: 'REG12345',
            validFrom: undefined,
            validTo: new Date('2025-12-31')
          }

          await expect(
            repository.update(organisation.id, 1, {
              registrations: [registrationToUpdate]
            })
          ).rejects.toThrow(
            'Invalid organisation data: registrations.0.validFrom: any.required'
          )
        })

        it('rejects update when registration status changes to suspended without validTo', async () => {
          const organisation = buildOrganisation()
          await repository.insert(organisation)

          const registrationToUpdate = {
            ...organisation.registrations[0],
            status: STATUS.SUSPENDED,
            registrationNumber: 'REG12345',
            validFrom: new Date('2025-01-01'),
            validTo: undefined
          }

          await expect(
            repository.update(organisation.id, 1, {
              registrations: [registrationToUpdate]
            })
          ).rejects.toThrow(
            'Invalid organisation data: registrations.0.validTo: any.required'
          )
        })

        it('allows update when registration status changes to suspended with validFrom and validTo', async () => {
          const organisation = buildOrganisation()
          await repository.insert(organisation)

          const validFrom = new Date('2025-01-01')
          const validTo = new Date('2025-12-31')

          const registrationToUpdate = {
            ...organisation.registrations[0],
            status: STATUS.SUSPENDED,
            registrationNumber: 'REG12345',
            validFrom,
            validTo
          }

          await repository.update(organisation.id, 1, {
            registrations: [registrationToUpdate]
          })

          const result = await repository.findById(organisation.id, 2)
          const updatedReg = result.registrations.find(
            (r) => r.id === registrationToUpdate.id
          )

          expect(updatedReg.status).toBe(STATUS.SUSPENDED)
          expect(updatedReg.validFrom).toEqual(validFrom)
          expect(updatedReg.validTo).toEqual(validTo)
        })

        it('allows update when registration status is not approved or suspended without validFrom and validTo', async () => {
          const organisation = buildOrganisation()
          await repository.insert(organisation)

          const registrationToUpdate = {
            ...organisation.registrations[0],
            material: 'plastic',
            validFrom: undefined,
            validTo: undefined
          }

          await repository.update(organisation.id, 1, {
            registrations: [registrationToUpdate]
          })

          const result = await repository.findById(organisation.id, 2)
          const updatedReg = result.registrations.find(
            (r) => r.id === registrationToUpdate.id
          )

          expect(updatedReg.material).toBe('plastic')
          expect(
            updatedReg.validFrom === null || updatedReg.validFrom === undefined
          ).toBe(true)
          expect(
            updatedReg.validTo === null || updatedReg.validTo === undefined
          ).toBe(true)
        })
      })

      describe('validFrom and validTo for accreditations', () => {
        it('rejects update when accreditation status changes to approved without validFrom', async () => {
          const organisation = buildOrganisation()
          await repository.insert(organisation)

          const accreditationToUpdate = {
            ...organisation.accreditations[0],
            status: STATUS.APPROVED,
            accreditationNumber: 'ACC12345',
            validFrom: undefined,
            validTo: new Date('2025-12-31')
          }

          await expect(
            repository.update(organisation.id, 1, {
              accreditations: [accreditationToUpdate]
            })
          ).rejects.toThrow(
            'Invalid organisation data: accreditations.0.validFrom: any.required'
          )
        })

        it('rejects update when accreditation status changes to approved without validTo', async () => {
          const organisation = buildOrganisation()
          await repository.insert(organisation)

          const accreditationToUpdate = {
            ...organisation.accreditations[0],
            status: STATUS.APPROVED,
            accreditationNumber: 'ACC12345',
            validFrom: new Date('2025-01-01'),
            validTo: undefined
          }

          await expect(
            repository.update(organisation.id, 1, {
              accreditations: [accreditationToUpdate]
            })
          ).rejects.toThrow(
            'Invalid organisation data: accreditations.0.validTo: any.required'
          )
        })

        it('allows update when accreditation status changes to approved with validFrom and validTo', async () => {
          const organisation = buildOrganisation()
          await repository.insert(organisation)

          const validFrom = new Date('2025-01-01')
          const validTo = new Date('2025-12-31')

          const accreditationToUpdate = {
            ...organisation.accreditations[0],
            status: STATUS.APPROVED,
            accreditationNumber: 'ACC12345',
            validFrom,
            validTo
          }

          await repository.update(organisation.id, 1, {
            accreditations: [accreditationToUpdate]
          })

          const result = await repository.findById(organisation.id, 2)
          const updatedAcc = result.accreditations.find(
            (a) => a.id === accreditationToUpdate.id
          )

          expect(updatedAcc.status).toBe(STATUS.APPROVED)
          expect(updatedAcc.validFrom).toEqual(validFrom)
          expect(updatedAcc.validTo).toEqual(validTo)
        })

        it('rejects update when accreditation status changes to suspended without validFrom', async () => {
          const organisation = buildOrganisation()
          await repository.insert(organisation)

          const accreditationToUpdate = {
            ...organisation.accreditations[0],
            status: STATUS.SUSPENDED,
            accreditationNumber: 'ACC12345',
            validFrom: undefined,
            validTo: new Date('2025-12-31')
          }

          await expect(
            repository.update(organisation.id, 1, {
              accreditations: [accreditationToUpdate]
            })
          ).rejects.toThrow(
            'Invalid organisation data: accreditations.0.validFrom: any.required'
          )
        })

        it('rejects update when accreditation status changes to suspended without validTo', async () => {
          const organisation = buildOrganisation()
          await repository.insert(organisation)

          const accreditationToUpdate = {
            ...organisation.accreditations[0],
            status: STATUS.SUSPENDED,
            accreditationNumber: 'ACC12345',
            validFrom: new Date('2025-01-01'),
            validTo: undefined
          }

          await expect(
            repository.update(organisation.id, 1, {
              accreditations: [accreditationToUpdate]
            })
          ).rejects.toThrow(
            'Invalid organisation data: accreditations.0.validTo: any.required'
          )
        })

        it('allows update when accreditation status changes to suspended with validFrom and validTo', async () => {
          const organisation = buildOrganisation()
          await repository.insert(organisation)

          const validFrom = new Date('2025-01-01')
          const validTo = new Date('2025-12-31')

          const accreditationToUpdate = {
            ...organisation.accreditations[0],
            status: STATUS.SUSPENDED,
            accreditationNumber: 'ACC12345',
            validFrom,
            validTo
          }

          await repository.update(organisation.id, 1, {
            accreditations: [accreditationToUpdate]
          })

          const result = await repository.findById(organisation.id, 2)
          const updatedAcc = result.accreditations.find(
            (a) => a.id === accreditationToUpdate.id
          )

          expect(updatedAcc.status).toBe(STATUS.SUSPENDED)
          expect(updatedAcc.validFrom).toEqual(validFrom)
          expect(updatedAcc.validTo).toEqual(validTo)
        })

        it('allows update when accreditation status is not approved or suspended without validFrom and validTo', async () => {
          const organisation = buildOrganisation()
          await repository.insert(organisation)

          const accreditationToUpdate = {
            ...organisation.accreditations[0],
            material: 'plastic',
            validFrom: undefined,
            validTo: undefined
          }

          await repository.update(organisation.id, 1, {
            accreditations: [accreditationToUpdate]
          })

          const result = await repository.findById(organisation.id, 2)
          const updatedAcc = result.accreditations.find(
            (a) => a.id === accreditationToUpdate.id
          )

          expect(updatedAcc.material).toBe('plastic')
          expect(
            updatedAcc.validFrom === null || updatedAcc.validFrom === undefined
          ).toBe(true)
          expect(
            updatedAcc.validTo === null || updatedAcc.validTo === undefined
          ).toBe(true)
        })
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
        ).rejects.toThrow('Invalid organisation data: id: any.unknown')
      })

      it('rejects updates to version field', async () => {
        const organisation = buildOrganisation()
        await repository.insert(organisation)

        await expect(
          repository.update(organisation.id, 1, {
            version: 99,
            wasteProcessingTypes: ['exporter']
          })
        ).rejects.toThrow('Invalid organisation data: version: any.unknown')
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
          'Invalid organisation data: schemaVersion: any.unknown'
        )
      })

      it('does not leak PII data in error messages', async () => {
        const organisation = buildOrganisation()
        await repository.insert(organisation)

        // Verify error message contains only field path and error type, not actual PII values
        await expect(
          repository.update(organisation.id, 1, {
            submitterContactDetails: {
              fullName: 'Jane Smith',
              email: 'jane.smith', // Invalid email format
              phone: '1234567890',
              title: 'Director'
            }
          })
        ).rejects.toThrow(
          'Invalid organisation data: submitterContactDetails.email: string.email'
        )
      })
    })
  })
}
