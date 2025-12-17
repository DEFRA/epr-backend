import { STATUS } from '#domain/organisations/model.js'
import { beforeEach, describe, expect } from 'vitest'
import {
  buildOrganisation,
  prepareOrgUpdate,
  buildRegistration
} from './test-data.js'

export const testReplaceBehaviour = (it) => {
  describe('replace', () => {
    let repository

    beforeEach(async ({ organisationsRepository }) => {
      repository = await organisationsRepository()
    })

    describe('basic behaviour', () => {
      it('updates organisation level fields successfully', async () => {
        const orgData = buildOrganisation()
        await repository.insert(orgData)

        const updatePayload = prepareOrgUpdate(orgData, {
          wasteProcessingTypes: ['reprocessor']
        })
        await repository.replace(orgData.id, 1, updatePayload)

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
        const { id, ...organisation } = buildOrganisation()

        await expect(
          repository.replace(id, 1, {
            ...organisation,
            schemaVersion: 1
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
          material: 'plastic',
          glassRecyclingProcess: null
        }
        const beforeUpdateOrg = await repository.findById(organisation.id)

        const updatePayload = prepareOrgUpdate(beforeUpdateOrg, {
          registrations: [registrationToUpdate]
        })
        await repository.replace(organisation.id, 1, updatePayload)

        const result = await repository.findById(organisation.id, 2)
        const updatedReg = result.registrations.find(
          (r) => r.id === registrationToUpdate.id
        )

        expect(updatedReg.material).toBe('plastic')
        expect(updatedReg.glassRecyclingProcess).toBeFalsy()
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
          glassRecyclingProcess: null,
          material: 'plastic'
        }

        const updatePayload = prepareOrgUpdate(organisation, {
          accreditations: [accreditationToUpdate]
        })
        await repository.replace(organisation.id, 1, updatePayload)

        const result = await repository.findById(organisation.id, 2)
        const updatedAcc = result.accreditations.find(
          (a) => a.id === accreditationToUpdate.id
        )

        const expectedAcc = {
          ...originalAcc,
          glassRecyclingProcess: null,
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

      it('adds new registration', async () => {
        const organisation = buildOrganisation()
        await repository.insert(organisation)

        const newRegistration = buildRegistration()
        const updatePayload = prepareOrgUpdate(organisation, {
          registrations: [newRegistration]
        })
        await repository.replace(organisation.id, 1, updatePayload)

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

        const { statusHistory: _, ...expectedReg } = {
          ...newRegistration,
          formSubmissionTime: new Date(newRegistration.formSubmissionTime)
        }
        const { statusHistory: actualStatusHistory, ...actualReg } = addedReg

        expect(actualReg).toMatchObject(expectedReg)
        expect(actualStatusHistory).toHaveLength(1)
        expect(actualStatusHistory[0].status).toBe(STATUS.CREATED)
      })

      it('adds new accreditation', async () => {
        const organisation = buildOrganisation()
        await repository.insert(organisation)

        const { ObjectId } = await import('mongodb')
        const newAccreditation = {
          ...organisation.accreditations[0],
          id: new ObjectId().toString(),
          material: 'aluminium',
          glassRecyclingProcess: null
        }
        delete newAccreditation.statusHistory
        const updatePayload = prepareOrgUpdate(organisation, {
          accreditations: [newAccreditation]
        })
        await repository.replace(organisation.id, 1, updatePayload)

        const result = await repository.findById(organisation.id, 2)

        expect(result.accreditations).toHaveLength(
          organisation.accreditations.length + 1
        )
        const addedAcc = result.accreditations.find(
          (a) => a.id === newAccreditation.id
        )
        expect(addedAcc).toBeDefined()

        const { statusHistory: _, ...expectedAcc } = {
          ...newAccreditation,
          formSubmissionTime: new Date(newAccreditation.formSubmissionTime)
        }
        const { statusHistory: actualStatusHistory, ...actualAcc } = addedAcc
        expect(actualAcc).toMatchObject(expectedAcc)
        expect(actualStatusHistory).toHaveLength(1)
        expect(actualStatusHistory[0].status).toBe(STATUS.CREATED)
      })

      it('removes registration and accreditation', async () => {
        const organisation = buildOrganisation()
        await repository.insert(organisation)

        // Organisation initially has 2 registrations and 3 accreditations
        expect(organisation.registrations).toHaveLength(2)
        expect(organisation.accreditations).toHaveLength(3)

        // Remove the second registration and last two accreditations by not including them
        const { id: _, ...orgWithoutId } = organisation
        const updatePayload = {
          ...orgWithoutId,
          registrations: [organisation.registrations[0]],
          accreditations: [organisation.accreditations[0]]
        }
        await repository.replace(organisation.id, 1, updatePayload)

        const result = await repository.findById(organisation.id, 2)

        // Verify only the first registration and accreditation remain
        expect(result.registrations).toHaveLength(1)
        expect(result.registrations[0].id).toBe(
          organisation.registrations[0].id
        )

        expect(result.accreditations).toHaveLength(1)
        expect(result.accreditations[0].id).toBe(
          organisation.accreditations[0].id
        )
      })
    })

    describe('optimistic concurrency control', () => {
      it('throws conflict error when version does not match', async () => {
        const organisation = buildOrganisation()
        await repository.insert(organisation)
        const updatePayload = prepareOrgUpdate(organisation, {
          wasteProcessingTypes: ['exporter']
        })

        await expect(
          repository.replace(organisation.id, 2, updatePayload)
        ).rejects.toMatchObject({
          isBoom: true,
          output: { statusCode: 409 }
        })
      })

      it('prevents lost updates in concurrent scenarios', async () => {
        const organisation = buildOrganisation()
        await repository.insert(organisation)
        const updatePayload1 = prepareOrgUpdate(organisation, {
          wasteProcessingTypes: ['exporter']
        })
        await repository.replace(organisation.id, 1, updatePayload1)

        const updatePayload2 = prepareOrgUpdate(organisation, {
          reprocessingNations: ['wales']
        })
        await expect(
          repository.replace(organisation.id, 1, updatePayload2)
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

        const updatePayload = prepareOrgUpdate(organisation, {
          status: STATUS.APPROVED
        })
        await repository.replace(organisation.id, 1, updatePayload)

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

        const updatePayload = prepareOrgUpdate(organisation, {
          wasteProcessingTypes: ['exporter']
        })
        await repository.replace(organisation.id, 1, updatePayload)

        const result = await repository.findById(organisation.id, 2)
        expect(result.status).toBe(STATUS.CREATED)
        expect(result.statusHistory).toHaveLength(1)
        expect(result.statusHistory[0].status).toBe(STATUS.CREATED)
      })

      it('preserves all existing statusHistory entries when organisation status changes', async () => {
        const organisation = buildOrganisation()
        await repository.insert(organisation)

        const orgUpdate1 = prepareOrgUpdate(organisation, {
          status: STATUS.APPROVED
        })
        await repository.replace(organisation.id, 1, orgUpdate1)

        const orgUpdate2 = prepareOrgUpdate(organisation, {
          status: STATUS.REJECTED
        })
        await repository.replace(organisation.id, 2, orgUpdate2)

        const org3 = await repository.findById(organisation.id, 3)
        const orgUpdate3 = prepareOrgUpdate(org3, {
          status: STATUS.SUSPENDED
        })
        await repository.replace(organisation.id, 3, orgUpdate3)

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
        const updatePayload = prepareOrgUpdate(organisation, {
          registrations: [registrationToUpdate]
        })
        await repository.replace(organisation.id, 1, updatePayload)

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

        const orgUpdate1 = prepareOrgUpdate(organisation, {
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
        await repository.replace(organisation.id, 1, orgUpdate1)

        const orgUpdate2 = prepareOrgUpdate(organisation, {
          registrations: [
            { ...organisation.registrations[0], status: STATUS.REJECTED }
          ]
        })
        await repository.replace(organisation.id, 2, orgUpdate2)

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
          status: STATUS.SUSPENDED,
          accreditationNumber: 'ACC12345',
          validFrom: new Date('2025-01-01'),
          validTo: new Date('2025-12-31')
        }
        const updatePayload = prepareOrgUpdate(organisation, {
          accreditations: [accreditationToUpdate]
        })
        await repository.replace(organisation.id, 1, updatePayload)

        const result = await repository.findById(organisation.id, 2)
        const updatedAcc = result.accreditations.find(
          (a) => a.id === accreditationToUpdate.id
        )
        expect(updatedAcc.status).toBe(STATUS.SUSPENDED)
        expect(updatedAcc.statusHistory).toHaveLength(2)
        expect(updatedAcc.statusHistory[0].status).toBe(STATUS.CREATED)
        expect(updatedAcc.statusHistory[1].status).toBe(STATUS.SUSPENDED)
        expect(updatedAcc.statusHistory[1].updatedAt).toBeInstanceOf(Date)
      })

      it('preserves all existing statusHistory entries for accreditation', async () => {
        const organisation = buildOrganisation()
        await repository.insert(organisation)

        const accId = organisation.accreditations[0].id

        const orgUpdate1 = prepareOrgUpdate(organisation, {
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
        await repository.replace(organisation.id, 1, orgUpdate1)

        const orgUpdate2 = prepareOrgUpdate(organisation, {
          accreditations: [
            {
              ...organisation.accreditations[0],
              status: STATUS.ARCHIVED,
              accreditationNumber: 'ACC12345',
              validFrom: new Date('2025-01-01'),
              validTo: new Date('2025-12-31')
            }
          ]
        })
        await repository.replace(organisation.id, 2, orgUpdate2)

        const result = await repository.findById(organisation.id, 3)
        const updatedAcc = result.accreditations.find((a) => a.id === accId)
        expect(updatedAcc.status).toBe(STATUS.ARCHIVED)
        expect(updatedAcc.statusHistory).toHaveLength(3)
        expect(updatedAcc.statusHistory[0].status).toBe(STATUS.CREATED)
        expect(updatedAcc.statusHistory[1].status).toBe(STATUS.SUSPENDED)
        expect(updatedAcc.statusHistory[2].status).toBe(STATUS.ARCHIVED)
      })

      it('rejects invalid status value', async () => {
        const organisation = buildOrganisation()
        await repository.insert(organisation)

        const updatePayload = prepareOrgUpdate(organisation, {
          status: 'invalid'
        })

        await expect(
          repository.replace(organisation.id, 1, updatePayload)
        ).rejects.toThrow('Invalid organisation data: status: any.only')
      })
    })

    describe('users', () => {
      describe('root users', () => {
        it('populates users field with submitter on any update', async () => {
          const organisation = buildOrganisation()
          await repository.insert(organisation)
          const updatePayload = prepareOrgUpdate(organisation, {
            status: STATUS.APPROVED
          })
          await repository.replace(organisation.id, 1, updatePayload)

          const result = await repository.findById(organisation.id, 2)

          expect(result.status).toBe(STATUS.APPROVED)
          expect(result.users).toBeDefined()
          expect(result.users).toHaveLength(1)
          expect(result.users[0]).toStrictEqual({
            fullName: organisation.submitterContactDetails.fullName,
            email: organisation.submitterContactDetails.email,
            roles: ['initial_user', 'standard_user']
          })
        })

        it('does not overwrite existing users when new users have matching emails', async () => {
          const organisation = buildOrganisation({
            submitterContactDetails: {
              fullName: 'Original Submitter',
              email: 'submitter@example.com',
              phone: '1234567890',
              jobTitle: 'Director'
            }
          })
          await repository.insert(organisation)

          const org1 = await repository.findById(organisation.id)
          const orgUpdate1 = prepareOrgUpdate(org1, {
            status: STATUS.APPROVED
          })
          await repository.replace(organisation.id, 1, orgUpdate1)

          let result = await repository.findById(organisation.id, 2)
          expect(result.users).toHaveLength(1)
          expect(result.users[0]).toEqual({
            fullName: 'Original Submitter',
            email: 'submitter@example.com',
            roles: ['initial_user', 'standard_user']
          })

          const registration = {
            ...organisation.registrations[0],
            submitterContactDetails: {
              fullName: 'Different Submitter Name',
              email: 'SUBMITTER@EXAMPLE.COM',
              phone: '9999999999',
              jobTitle: 'Manager'
            },
            approvedPersons: [
              {
                fullName: 'New Person',
                email: 'newperson@example.com',
                phone: '8888888888',
                jobTitle: 'Executive'
              }
            ]
          }

          const org2 = await repository.findById(organisation.id, 2)
          const orgUpdate2 = prepareOrgUpdate(org2, {
            registrations: [
              {
                ...registration,
                status: STATUS.APPROVED,
                cbduNumber: 'CBDU12345',
                registrationNumber: 'REG12345',
                validFrom: new Date('2025-01-01'),
                validTo: new Date('2025-12-31')
              }
            ]
          })
          await repository.replace(organisation.id, 2, orgUpdate2)

          result = await repository.findById(organisation.id, 3)
          expect(result.users).toEqual([
            {
              fullName: 'Original Submitter',
              email: 'submitter@example.com',
              roles: ['initial_user', 'standard_user']
            },
            {
              fullName: 'New Person',
              email: 'newperson@example.com',
              roles: ['initial_user', 'standard_user']
            }
          ])
        })
      })

      describe('registrations', () => {
        it('collates users when registration is approved and deduplicates by email', async () => {
          const organisation = buildOrganisation({
            submitterContactDetails: {
              fullName: 'John Doe',
              email: 'john@example.com',
              phone: '1234567890',
              jobTitle: 'Director'
            }
          })
          await repository.insert(organisation)

          const registration = {
            ...organisation.registrations[0],
            submitterContactDetails: {
              fullName: 'John Doe Different Name',
              email: 'JOHN@EXAMPLE.COM',
              phone: '9876543210',
              jobTitle: 'Manager'
            },
            approvedPersons: [
              {
                fullName: 'Jane Smith',
                email: 'jane@example.com',
                phone: '1111111111',
                jobTitle: 'Executive'
              },
              {
                fullName: 'John Doe Yet Another Name',
                email: 'john@example.com',
                phone: '2222222222',
                jobTitle: 'Supervisor'
              }
            ]
          }
          const updatePayload = prepareOrgUpdate(organisation, {
            registrations: [
              {
                ...registration,
                status: STATUS.APPROVED,
                cbduNumber: 'CBDU12345',
                registrationNumber: 'REG123',
                validFrom: new Date('2025-01-01'),
                validTo: new Date('2025-12-31')
              }
            ]
          })
          await repository.replace(organisation.id, 1, updatePayload)

          const result = await repository.findById(organisation.id, 2)
          const updatedReg = result.registrations.find(
            (r) => r.id === registration.id
          )

          expect(updatedReg.status).toBe(STATUS.APPROVED)
          expect(result.users).toEqual([
            {
              fullName: 'John Doe',
              email: 'john@example.com',
              roles: ['initial_user', 'standard_user']
            },
            {
              fullName: 'Jane Smith',
              email: 'jane@example.com',
              roles: ['initial_user', 'standard_user']
            }
          ])
        })

        it('only includes users from approved registrations', async () => {
          const organisation = buildOrganisation()
          await repository.insert(organisation)

          const reg1 = organisation.registrations[0]
          const reg2 = buildRegistration({
            wasteProcessingType: 'exporter',
            submitterContactDetails: {
              fullName: 'Han Solo',
              email: 'han.solo@starwars.com',
              phone: '9999999999',
              jobTitle: 'Smuggler'
            },
            approvedPersons: [
              {
                fullName: 'Chewbacca',
                email: 'chewie@starwars.com',
                phone: '8888888888',
                jobTitle: 'Co-pilot'
              }
            ]
          })
          const updatePayload = prepareOrgUpdate(organisation, {
            registrations: [
              {
                ...reg1,
                status: STATUS.APPROVED,
                registrationNumber: 'REG123',
                validFrom: new Date('2025-01-01'),
                validTo: new Date('2025-12-31')
              },
              {
                ...reg2,
                status: STATUS.CREATED
              }
            ]
          })
          await repository.replace(organisation.id, 1, updatePayload)

          const result = await repository.findById(organisation.id, 2)
          const updatedReg1 = result.registrations.find((r) => r.id === reg1.id)
          const updatedReg2 = result.registrations.find((r) => r.id === reg2.id)

          expect(updatedReg1.status).toBe(STATUS.APPROVED)
          expect(updatedReg2.status).toBe(STATUS.CREATED)
          expect(result.users).toEqual([
            {
              fullName: 'Luke Skywalker',
              email: 'anakin.skywalker@starwars.com',
              roles: ['initial_user', 'standard_user']
            },
            {
              fullName: 'Luke Skywalker',
              email: 'luke.skywalker@starwars.com',
              roles: ['initial_user', 'standard_user']
            }
          ])
        })
      })

      describe('accreditations', () => {
        it('collates users when accreditation is approved and deduplicates by email', async () => {
          const organisation = buildOrganisation({
            submitterContactDetails: {
              fullName: 'Alice Cooper',
              email: 'alice@example.com',
              phone: '1234567890',
              jobTitle: 'CEO'
            }
          })
          await repository.insert(organisation)

          const registration = organisation.registrations[0]
          const accreditation = {
            ...organisation.accreditations[0],
            registrationId: registration.id,
            submitterContactDetails: {
              fullName: 'Alice Cooper Alt',
              email: 'ALICE@EXAMPLE.COM',
              phone: '9876543210',
              jobTitle: 'Director'
            },
            prnIssuance: {
              ...organisation.accreditations[0].prnIssuance,
              signatories: [
                {
                  fullName: 'Bob Builder',
                  email: 'bob@example.com',
                  phone: '1111111111',
                  jobTitle: 'Manager'
                },
                {
                  fullName: 'Alice Cooper Different',
                  email: 'alice@example.com',
                  phone: '2222222222',
                  jobTitle: 'Officer'
                }
              ]
            }
          }
          const updatePayload = prepareOrgUpdate(organisation, {
            registrations: [
              {
                ...registration,
                status: STATUS.APPROVED,
                registrationNumber: 'REG123',
                validFrom: new Date('2025-01-01'),
                validTo: new Date('2025-12-31')
              }
            ],
            accreditations: [
              {
                ...accreditation,
                status: STATUS.APPROVED,
                accreditationNumber: 'ACC123',
                validFrom: new Date('2025-01-01'),
                validTo: new Date('2025-12-31')
              }
            ]
          })
          await repository.replace(organisation.id, 1, updatePayload)

          const result = await repository.findById(organisation.id, 2)
          const updatedAcc = result.accreditations.find(
            (a) => a.id === accreditation.id
          )

          expect(updatedAcc.status).toBe(STATUS.APPROVED)
          expect(result.users).toEqual([
            {
              fullName: 'Alice Cooper',
              email: 'alice@example.com',
              roles: ['initial_user', 'standard_user']
            },
            {
              fullName: 'Luke Skywalker',
              email: 'luke.skywalker@starwars.com',
              roles: ['initial_user', 'standard_user']
            },
            {
              fullName: 'Bob Builder',
              email: 'bob@example.com',
              roles: ['initial_user', 'standard_user']
            }
          ])
        })

        it('only includes users from approved accreditations', async () => {
          const organisation = buildOrganisation()
          await repository.insert(organisation)

          const registration = organisation.registrations[0]
          const acc1 = {
            ...organisation.accreditations[0],
            registrationId: registration.id
          }
          const acc2 = {
            ...organisation.accreditations[1],
            registrationId: registration.id,
            submitterContactDetails: {
              ...organisation.accreditations[1].submitterContactDetails,
              email: 'notapproved@example.com'
            },
            prnIssuance: {
              ...organisation.accreditations[1].prnIssuance,
              signatories:
                organisation.accreditations[1].prnIssuance.signatories.map(
                  (sig) => ({ ...sig, email: 'notapprovedsig@example.com' })
                )
            }
          }
          const updatePayload = prepareOrgUpdate(organisation, {
            registrations: [
              {
                ...registration,
                status: STATUS.APPROVED,
                registrationNumber: 'REG123',
                validFrom: new Date('2025-01-01'),
                validTo: new Date('2025-12-31')
              }
            ],
            accreditations: [
              {
                ...acc1,
                status: STATUS.APPROVED,
                accreditationNumber: 'ACC123',
                validFrom: new Date('2025-01-01'),
                validTo: new Date('2025-12-31')
              },
              acc2
            ]
          })
          await repository.replace(organisation.id, 1, updatePayload)

          const result = await repository.findById(organisation.id, 2)
          const updatedAcc1 = result.accreditations.find(
            (a) => a.id === acc1.id
          )
          const updatedAcc2 = result.accreditations.find(
            (a) => a.id === acc2.id
          )

          expect(updatedAcc1.status).toBe(STATUS.APPROVED)
          expect(updatedAcc2.status).toBe(STATUS.CREATED)
          expect(result.users).toEqual([
            {
              fullName: 'Luke Skywalker',
              email: 'anakin.skywalker@starwars.com',
              roles: ['initial_user', 'standard_user']
            },
            {
              fullName: 'Luke Skywalker',
              email: 'luke.skywalker@starwars.com',
              roles: ['initial_user', 'standard_user']
            },
            {
              fullName: 'Yoda',
              email: 'yoda@starwars.com',
              roles: ['initial_user', 'standard_user']
            }
          ])
        })
      })
    })

    describe('non-updatable fields validation', () => {
      it('rejects updates to id field', async () => {
        const organisation = buildOrganisation()
        await repository.insert(organisation)

        const newId = buildOrganisation().id
        const updatePayload = prepareOrgUpdate(organisation, {
          id: newId,
          wasteProcessingTypes: ['exporter']
        })

        await expect(
          repository.replace(organisation.id, 1, updatePayload)
        ).rejects.toThrow('Invalid organisation data: id: any.unknown')
      })

      it('does not leak PII data in error messages', async () => {
        const organisation = buildOrganisation()
        await repository.insert(organisation)
        const updatePayload = prepareOrgUpdate(organisation, {
          submitterContactDetails: {
            fullName: 'Jane Smith',
            email: 'jane.smith', // Invalid email format
            phone: '1234567890',
            jobTitle: 'Director'
          }
        })

        // Verify error message contains only field path and error type, not actual PII values
        await expect(
          repository.replace(organisation.id, 1, updatePayload)
        ).rejects.toThrow(
          'Invalid organisation data: submitterContactDetails.email: string.email'
        )
      })
    })
  })
}
