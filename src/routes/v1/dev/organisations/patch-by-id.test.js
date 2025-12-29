import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'
import {
  buildAccreditation,
  buildOrganisation,
  buildRegistration,
  getValidDateRange
} from '#repositories/organisations/contract/test-data.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createTestServer } from '#test/create-test-server.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { StatusCodes } from 'http-status-codes'
import { ObjectId } from 'mongodb'
import { REPROCESSING_TYPE } from '#domain/organisations/model.js'

describe('PATCH /v1/dev/organisations/{id}', () => {
  setupAuthContext()
  let server
  let organisationsRepositoryFactory
  let organisationsRepository
  const { VALID_FROM, VALID_TO } = getValidDateRange()

  beforeEach(async () => {
    organisationsRepositoryFactory = createInMemoryOrganisationsRepository([])
    organisationsRepository = organisationsRepositoryFactory()
    const featureFlags = createInMemoryFeatureFlags({ devEndpoints: true })

    server = await createTestServer({
      repositories: { organisationsRepository: organisationsRepositoryFactory },
      featureFlags
    })
  })

  describe('feature flag disabled', () => {
    it('should return 404 when devEndpoints feature flag is disabled', async () => {
      const featureFlags = createInMemoryFeatureFlags({ devEndpoints: false })
      const testServer = await createTestServer({
        repositories: {
          organisationsRepository: organisationsRepositoryFactory
        },
        featureFlags
      })

      const org = buildOrganisation()
      await organisationsRepository.insert(org)

      const response = await testServer.inject({
        method: 'PATCH',
        url: `/v1/dev/organisations/${org.id}`,
        payload: {
          organisation: { wasteProcessingTypes: ['reprocessor'] }
        }
      })

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
    })
  })

  describe('happy path', () => {
    it('should return 200 and the updated organisation with auto-fetched version', async () => {
      const org = buildOrganisation()

      await organisationsRepository.insert(org)

      const response = await server.inject({
        method: 'PATCH',
        url: `/v1/dev/organisations/${org.id}`,
        payload: {
          organisation: { ...org, wasteProcessingTypes: ['reprocessor'] }
        }
      })

      expect(response.statusCode).toBe(StatusCodes.OK)

      const body = JSON.parse(response.payload)
      expect(body.organisation.id).toBe(org.id)
      expect(body.organisation.version).toBe(org.version + 1)
      expect(body.organisation.wasteProcessingTypes).toEqual(['reprocessor'])
    })

    it('should include Cache-Control header in successful response', async () => {
      const org = buildOrganisation()
      await organisationsRepository.insert(org)

      const response = await server.inject({
        method: 'PATCH',
        url: `/v1/dev/organisations/${org.id}`,
        payload: {
          organisation: { wasteProcessingTypes: org.wasteProcessingTypes }
        }
      })

      expect(response.headers['cache-control']).toBe(
        'no-cache, no-store, must-revalidate'
      )
    })

    it('should not require authentication', async () => {
      const org = buildOrganisation()
      await organisationsRepository.insert(org)

      const response = await server.inject({
        method: 'PATCH',
        url: `/v1/dev/organisations/${org.id}`,
        payload: {
          organisation: { wasteProcessingTypes: ['reprocessor'] }
        }
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
    })
  })

  describe('not found cases', () => {
    describe('when the orgId does not exist', () => {
      let response

      beforeEach(async () => {
        const org = buildOrganisation()
        const nonExistentId = new ObjectId().toString()

        await organisationsRepository.insert(org)

        response = await server.inject({
          method: 'PATCH',
          url: `/v1/dev/organisations/${nonExistentId}`,
          payload: {
            organisation: { ...org, wasteProcessingTypes: ['reprocessor'] }
          }
        })
      })

      it('should return 404', () => {
        expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
      })

      it('should include Cache-Control header in error response', () => {
        expect(response.headers['cache-control']).toBe(
          'no-cache, no-store, must-revalidate'
        )
      })
    })

    it('should return 422 when orgId is whitespace-only', async () => {
      const response = await server.inject({
        method: 'PATCH',
        url: '/v1/dev/organisations/%20%20%20',
        payload: {
          organisation: { wasteProcessingTypes: ['reprocessor'] }
        }
      })

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
      const body = JSON.parse(response.payload)
      expect(body.message).toBe('"id" cannot be empty')
    })
  })

  describe('invalid payload', () => {
    it('should return 422 when organisation field is missing', async () => {
      const org = buildOrganisation()
      await organisationsRepository.insert(org)

      const response = await server.inject({
        method: 'PATCH',
        url: `/v1/dev/organisations/${org.id}`,
        payload: {}
      })

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
      const body = JSON.parse(response.payload)
      expect(body.message).toBe('"organisation" is required')
    })

    it('should return 422 when organisation is null', async () => {
      const org = buildOrganisation()
      await organisationsRepository.insert(org)

      const response = await server.inject({
        method: 'PATCH',
        url: `/v1/dev/organisations/${org.id}`,
        payload: {
          organisation: null
        }
      })

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
      const body = JSON.parse(response.payload)
      expect(body.message).toBe('"organisation" must be an object')
    })

    it('should return 422 when organisation is not an object', async () => {
      const org = buildOrganisation()
      await organisationsRepository.insert(org)

      const response = await server.inject({
        method: 'PATCH',
        url: `/v1/dev/organisations/${org.id}`,
        payload: {
          organisation: 'not-an-object'
        }
      })

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
      const body = JSON.parse(response.payload)
      expect(body.message).toBe('"organisation" must be an object')
    })
  })

  it('should include validation error information in the response', async () => {
    const org = buildOrganisation()
    await organisationsRepository.insert(org)

    const response = await server.inject({
      method: 'PATCH',
      url: `/v1/dev/organisations/${org.id}`,
      payload: {
        organisation: { ...org, wasteProcessingTypes: [] }
      }
    })

    expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    const body = JSON.parse(response.payload)
    expect(body.message).toBe(
      'Invalid organisation data: wasteProcessingTypes: array.min'
    )
  })

  describe('deep merge', () => {
    it('should deep merge nested objects preserving existing fields', async () => {
      const org = buildOrganisation()
      await organisationsRepository.insert(org)

      const originalEmail = org.submitterContactDetails.email
      const originalPhone = org.submitterContactDetails.phone

      const response = await server.inject({
        method: 'PATCH',
        url: `/v1/dev/organisations/${org.id}`,
        payload: {
          organisation: {
            submitterContactDetails: {
              fullName: 'Updated Name'
            }
          }
        }
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
      const body = JSON.parse(response.payload)
      expect(body.organisation.submitterContactDetails).toStrictEqual(
        expect.objectContaining({
          fullName: 'Updated Name',
          email: originalEmail,
          phone: originalPhone
        })
      )
    })

    it('should replace non-special arrays', async () => {
      const org = buildOrganisation()
      await organisationsRepository.insert(org)

      const response = await server.inject({
        method: 'PATCH',
        url: `/v1/dev/organisations/${org.id}`,
        payload: {
          organisation: {
            wasteProcessingTypes: ['exporter']
          }
        }
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
      const body = JSON.parse(response.payload)
      expect(body.organisation.wasteProcessingTypes).toEqual(['exporter'])
    })

    it('should merge registrations by ID', async () => {
      const org = buildOrganisation()
      await organisationsRepository.insert(org)

      const registrationId = org.registrations[0].id
      const originalOrgName = org.registrations[0].orgName

      const response = await server.inject({
        method: 'PATCH',
        url: `/v1/dev/organisations/${org.id}`,
        payload: {
          organisation: {
            registrations: [
              {
                id: registrationId,
                cbduNumber: 'CBDU12345'
              }
            ]
          }
        }
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
      const body = JSON.parse(response.payload)
      const updatedReg = body.organisation.registrations.find(
        (r) => r.id === registrationId
      )
      expect(updatedReg).toStrictEqual(
        expect.objectContaining({
          cbduNumber: 'CBDU12345',
          orgName: originalOrgName
        })
      )
    })

    it('should merge accreditations by ID', async () => {
      const org = buildOrganisation()
      await organisationsRepository.insert(org)

      const accreditationId = org.accreditations[0].id
      const originalOrgName = org.accreditations[0].orgName

      const response = await server.inject({
        method: 'PATCH',
        url: `/v1/dev/organisations/${org.id}`,
        payload: {
          organisation: {
            accreditations: [
              {
                id: accreditationId,
                material: 'plastic',
                glassRecyclingProcess: null
              }
            ]
          }
        }
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
      const body = JSON.parse(response.payload)
      const updatedAcc = body.organisation.accreditations.find(
        (a) => a.id === accreditationId
      )
      expect(updatedAcc).toStrictEqual(
        expect.objectContaining({
          material: 'plastic',
          orgName: originalOrgName,
          glassRecyclingProcess: null
        })
      )
    })
  })

  describe('status lifecycle and user collation', () => {
    describe('when approving a single registration', () => {
      it('should update statusHistory and collate users', async () => {
        const org = buildOrganisation()
        await organisationsRepository.insert(org)

        const registrationId = org.registrations[0].id

        const response = await server.inject({
          method: 'PATCH',
          url: `/v1/dev/organisations/${org.id}`,
          payload: {
            organisation: {
              registrations: [
                {
                  id: registrationId,
                  status: 'approved',
                  validFrom: VALID_FROM,
                  validTo: VALID_TO,
                  registrationNumber: 'R25TEST001',
                  reprocessingType: REPROCESSING_TYPE.INPUT
                }
              ]
            }
          }
        })

        expect(response.statusCode).toBe(StatusCodes.OK)
        const body = JSON.parse(response.payload)

        const updatedReg = body.organisation.registrations.find(
          (r) => r.id === registrationId
        )

        expect(updatedReg.statusHistory).toHaveLength(2)
        expect(updatedReg.statusHistory[0].status).toBe('created')
        expect(updatedReg.statusHistory[1].status).toBe('approved')
        expect(updatedReg.status).toBe('approved')

        expect(body.organisation.users.length).toBeGreaterThan(0)
        const submitterEmail =
          org.registrations[0].submitterContactDetails.email
        expect(
          body.organisation.users.some((u) => u.email === submitterEmail)
        ).toBe(true)
      })

      it('should include all users from approved registration', async () => {
        const org = buildOrganisation()
        await organisationsRepository.insert(org)

        const registrationId = org.registrations[0].id
        const approvedPersons = org.registrations[0].approvedPersons

        const response = await server.inject({
          method: 'PATCH',
          url: `/v1/dev/organisations/${org.id}`,
          payload: {
            organisation: {
              registrations: [
                {
                  id: registrationId,
                  status: 'approved',
                  validFrom: VALID_FROM,
                  validTo: VALID_TO,
                  registrationNumber: 'R25TEST001',
                  reprocessingType: REPROCESSING_TYPE.INPUT
                }
              ]
            }
          }
        })

        const body = JSON.parse(response.payload)
        const userEmails = body.organisation.users.map((u) => u.email)

        const submitterEmail =
          org.registrations[0].submitterContactDetails.email
        expect(userEmails).toContain(submitterEmail)

        for (const approvedPerson of approvedPersons) {
          expect(userEmails).toContain(approvedPerson.email)
        }
      })
    })

    describe('when approving an accreditation', () => {
      it('should update statusHistory and collate signatories', async () => {
        const org = buildOrganisation()
        await organisationsRepository.insert(org)

        const accreditationId = org.accreditations[0].id
        const linkedRegistrationId = org.registrations[0].id

        const response = await server.inject({
          method: 'PATCH',
          url: `/v1/dev/organisations/${org.id}`,
          payload: {
            organisation: {
              registrations: [
                {
                  id: linkedRegistrationId,
                  status: 'approved',
                  validFrom: VALID_FROM,
                  validTo: VALID_TO,
                  registrationNumber: 'R25TEST001',
                  reprocessingType: REPROCESSING_TYPE.INPUT
                }
              ],
              accreditations: [
                {
                  id: accreditationId,
                  status: 'approved',
                  validFrom: VALID_FROM,
                  validTo: VALID_TO,
                  accreditationNumber: 'ACC25TEST001',
                  reprocessingType: REPROCESSING_TYPE.INPUT
                }
              ]
            }
          }
        })

        expect(response.statusCode).toBe(StatusCodes.OK)
        const body = JSON.parse(response.payload)

        const updatedAcc = body.organisation.accreditations.find(
          (a) => a.id === accreditationId
        )

        expect(updatedAcc.statusHistory).toHaveLength(2)
        expect(updatedAcc.statusHistory[0].status).toBe('created')
        expect(updatedAcc.statusHistory[1].status).toBe('approved')
        expect(updatedAcc.status).toBe('approved')

        const signatories = org.accreditations[0].prnIssuance.signatories
        const userEmails = body.organisation.users.map((u) => u.email)

        for (const signatory of signatories) {
          expect(userEmails).toContain(signatory.email)
        }
      })
    })

    describe('when approving multiple items', () => {
      it('should update all statusHistory entries and collate all users', async () => {
        const reprocessorReg = buildRegistration({
          wasteProcessingType: 'reprocessor'
        })
        const exporterReg = buildRegistration({
          wasteProcessingType: 'exporter'
        })
        const accreditation = buildAccreditation({
          wasteProcessingType: 'reprocessor'
        })

        reprocessorReg.accreditationId = accreditation.id

        const org = buildOrganisation({
          registrations: [reprocessorReg, exporterReg],
          accreditations: [accreditation]
        })
        await organisationsRepository.insert(org)

        const response = await server.inject({
          method: 'PATCH',
          url: `/v1/dev/organisations/${org.id}`,
          payload: {
            organisation: {
              registrations: [
                {
                  id: org.registrations[0].id,
                  status: 'approved',
                  validFrom: VALID_FROM,
                  validTo: VALID_TO,
                  registrationNumber: 'R25TEST001',
                  reprocessingType: REPROCESSING_TYPE.INPUT
                },
                {
                  id: org.registrations[1].id,
                  status: 'approved',
                  validFrom: VALID_FROM,
                  validTo: VALID_TO,
                  registrationNumber: 'R25TEST002'
                }
              ],
              accreditations: [
                {
                  id: org.accreditations[0].id,
                  status: 'approved',
                  validFrom: VALID_FROM,
                  validTo: VALID_TO,
                  accreditationNumber: 'ACC25TEST001',
                  reprocessingType: REPROCESSING_TYPE.INPUT
                }
              ]
            }
          }
        })

        expect(response.statusCode).toBe(StatusCodes.OK)
        const body = JSON.parse(response.payload)

        for (const reg of body.organisation.registrations) {
          expect(reg.statusHistory).toHaveLength(2)
          expect(reg.statusHistory[1].status).toBe('approved')
          expect(reg.status).toBe('approved')
        }

        for (const acc of body.organisation.accreditations) {
          expect(acc.statusHistory).toHaveLength(2)
          expect(acc.statusHistory[1].status).toBe('approved')
          expect(acc.status).toBe('approved')
        }

        const userEmails = body.organisation.users.map((u) => u.email)
        expect(userEmails.length).toBeGreaterThan(0)

        for (const reg of org.registrations) {
          expect(userEmails).toContain(reg.submitterContactDetails.email)
        }

        for (const acc of org.accreditations) {
          expect(userEmails).toContain(acc.submitterContactDetails.email)
        }
      })
    })

    describe('when status does not change', () => {
      it('should not add duplicate statusHistory entries', async () => {
        const org = buildOrganisation()
        await organisationsRepository.insert(org)

        const registrationId = org.registrations[0].id

        const firstUpdate = await server.inject({
          method: 'PATCH',
          url: `/v1/dev/organisations/${org.id}`,
          payload: {
            organisation: {
              registrations: [
                {
                  id: registrationId,
                  status: 'approved',
                  validFrom: VALID_FROM,
                  validTo: VALID_TO,
                  registrationNumber: 'R25TEST001',
                  reprocessingType: REPROCESSING_TYPE.INPUT
                }
              ]
            }
          }
        })

        expect(firstUpdate.statusCode).toBe(StatusCodes.OK)
        const firstBody = JSON.parse(firstUpdate.payload)
        const firstReg = firstBody.organisation.registrations.find(
          (r) => r.id === registrationId
        )
        expect(firstReg.statusHistory).toHaveLength(2)

        const secondUpdate = await server.inject({
          method: 'PATCH',
          url: `/v1/dev/organisations/${org.id}`,
          payload: {
            organisation: {
              registrations: [
                {
                  id: registrationId,
                  status: 'approved',
                  cbduNumber: 'CBDU99999'
                }
              ]
            }
          }
        })

        expect(secondUpdate.statusCode).toBe(StatusCodes.OK)
        const secondBody = JSON.parse(secondUpdate.payload)
        const secondReg = secondBody.organisation.registrations.find(
          (r) => r.id === registrationId
        )

        expect(secondReg.statusHistory).toHaveLength(2)
        expect(secondReg.cbduNumber).toBe('CBDU99999')
      })
    })

    describe('when rejecting an item', () => {
      it('should update statusHistory to rejected', async () => {
        const org = buildOrganisation()
        await organisationsRepository.insert(org)

        const registrationId = org.registrations[0].id

        const response = await server.inject({
          method: 'PATCH',
          url: `/v1/dev/organisations/${org.id}`,
          payload: {
            organisation: {
              registrations: [
                {
                  id: registrationId,
                  status: 'rejected'
                }
              ]
            }
          }
        })

        expect(response.statusCode).toBe(StatusCodes.OK)
        const body = JSON.parse(response.payload)

        const updatedReg = body.organisation.registrations.find(
          (r) => r.id === registrationId
        )

        expect(updatedReg.statusHistory).toHaveLength(2)
        expect(updatedReg.statusHistory[1].status).toBe('rejected')
        expect(updatedReg.status).toBe('rejected')
      })
    })
  })

  describe('when updating without registrations/accreditations in payload', () => {
    it('should preserve existing registrations and accreditations', async () => {
      const org = buildOrganisation()
      await organisationsRepository.insert(org)

      const response = await server.inject({
        method: 'PATCH',
        url: `/v1/dev/organisations/${org.id}`,
        payload: {
          organisation: {
            businessType: 'individual'
          }
        }
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
      const { organisation } = JSON.parse(response.payload)
      expect(organisation.businessType).toBe('individual')
      expect(organisation.registrations).toHaveLength(org.registrations.length)
      expect(organisation.accreditations).toHaveLength(
        org.accreditations.length
      )
    })

    it('should preserve existing registrations when null is passed', async () => {
      const org = buildOrganisation()
      await organisationsRepository.insert(org)

      const response = await server.inject({
        method: 'PATCH',
        url: `/v1/dev/organisations/${org.id}`,
        payload: {
          organisation: {
            businessType: 'individual',
            registrations: null
          }
        }
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
      const { organisation } = JSON.parse(response.payload)
      expect(organisation.registrations).toHaveLength(org.registrations.length)
    })
  })
})
