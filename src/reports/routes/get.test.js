import { ObjectId } from 'mongodb'
import { StatusCodes } from 'http-status-codes'
import { createTestServer } from '#test/create-test-server.js'
import { asStandardUser } from '#test/inject-auth.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createInMemoryWasteRecordsRepository } from '#repositories/waste-records/inmemory.js'
import {
  buildOrganisation,
  buildRegistration
} from '#repositories/organisations/contract/test-data.js'
import { buildWasteRecord } from '#repositories/waste-records/contract/test-data.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { reportsGetPath } from './get.js'

describe(`GET ${reportsGetPath}`, () => {
  setupAuthContext()

  const makeUrl = (orgId, regId) =>
    `/v1/organisations/${orgId}/registrations/${regId}/reports`

  describe('when feature flag is enabled', () => {
    const createServer = async (
      registrationOverrides = {},
      wasteRecordOverrides = []
    ) => {
      const registration = buildRegistration(registrationOverrides)
      const org = buildOrganisation({
        registrations: [registration]
      })

      const organisationsRepositoryFactory =
        createInMemoryOrganisationsRepository()
      const organisationsRepository = organisationsRepositoryFactory()
      await organisationsRepository.insert(org)

      const wasteRecords = wasteRecordOverrides.map((overrides) =>
        buildWasteRecord({
          ...overrides,
          organisationId: org.id,
          registrationId: registration.id
        })
      )

      const wasteRecordsRepositoryFactory =
        createInMemoryWasteRecordsRepository(wasteRecords)

      const server = await createTestServer({
        repositories: {
          organisationsRepository: organisationsRepositoryFactory,
          wasteRecordsRepository: wasteRecordsRepositoryFactory
        },
        featureFlags: createInMemoryFeatureFlags({ reports: true })
      })

      return {
        server,
        organisationId: org.id,
        registrationId: registration.id
      }
    }

    const makeRequest = (server, orgId, regId) =>
      server.inject({
        method: 'GET',
        url: makeUrl(orgId, regId),
        ...asStandardUser({ linkedOrgId: orgId })
      })

    describe('registered-only operator (no accreditation)', () => {
      it('returns 200', async () => {
        const { server, organisationId, registrationId } = await createServer({
          wasteProcessingType: 'exporter',
          accreditationId: undefined
        })

        const response = await makeRequest(
          server,
          organisationId,
          registrationId
        )

        expect(response.statusCode).toBe(StatusCodes.OK)
      })

      it('returns quarterly cadence', async () => {
        const { server, organisationId, registrationId } = await createServer({
          wasteProcessingType: 'exporter',
          accreditationId: undefined
        })

        const response = await makeRequest(
          server,
          organisationId,
          registrationId
        )
        const payload = JSON.parse(response.payload)

        expect(payload.cadence).toBe('quarterly')
      })

      it('returns empty periods when no waste records exist', async () => {
        const { server, organisationId, registrationId } = await createServer({
          wasteProcessingType: 'exporter',
          accreditationId: undefined
        })

        const response = await makeRequest(
          server,
          organisationId,
          registrationId
        )
        const payload = JSON.parse(response.payload)

        expect(payload.periods).toStrictEqual([])
      })

      it('returns periods derived from waste record dates', async () => {
        const { server, organisationId, registrationId } = await createServer(
          {
            wasteProcessingType: 'exporter',
            accreditationId: undefined
          },
          [
            {
              type: WASTE_RECORD_TYPE.RECEIVED,
              data: { MONTH_RECEIVED_FOR_EXPORT: '2026-01-01' }
            },
            {
              type: WASTE_RECORD_TYPE.RECEIVED,
              data: { MONTH_RECEIVED_FOR_EXPORT: '2026-07-01' }
            }
          ]
        )

        const response = await makeRequest(
          server,
          organisationId,
          registrationId
        )
        const payload = JSON.parse(response.payload)

        expect(payload.periods).toStrictEqual([
          {
            year: 2026,
            period: 1,
            startDate: '2026-01-01',
            endDate: '2026-03-31'
          },
          {
            year: 2026,
            period: 3,
            startDate: '2026-07-01',
            endDate: '2026-09-30'
          }
        ])
      })
    })

    describe('accredited operator', () => {
      const currentYear = new Date().getUTCFullYear()

      it('returns monthly cadence', async () => {
        const { server, organisationId, registrationId } = await createServer({
          wasteProcessingType: 'exporter',
          accreditationId: new ObjectId().toString()
        })

        const response = await makeRequest(
          server,
          organisationId,
          registrationId
        )
        const payload = JSON.parse(response.payload)

        expect(payload.cadence).toBe('monthly')
      })

      it('returns periods from waste records in current year', async () => {
        const { server, organisationId, registrationId } = await createServer(
          {
            wasteProcessingType: 'exporter',
            accreditationId: new ObjectId().toString()
          },
          [
            {
              type: WASTE_RECORD_TYPE.EXPORTED,
              data: {
                DATE_RECEIVED_FOR_EXPORT: `${currentYear}-03-15`
              }
            }
          ]
        )

        const response = await makeRequest(
          server,
          organisationId,
          registrationId
        )
        const payload = JSON.parse(response.payload)

        expect(payload.periods).toStrictEqual([
          {
            year: currentYear,
            period: 3,
            startDate: `${currentYear}-03-01`,
            endDate: `${currentYear}-03-31`
          }
        ])
      })

      it('excludes waste records from previous years', async () => {
        const previousYear = currentYear - 1

        const { server, organisationId, registrationId } = await createServer(
          {
            wasteProcessingType: 'exporter',
            accreditationId: new ObjectId().toString()
          },
          [
            {
              type: WASTE_RECORD_TYPE.EXPORTED,
              data: {
                DATE_RECEIVED_FOR_EXPORT: `${previousYear}-12-15`
              }
            }
          ]
        )

        const response = await makeRequest(
          server,
          organisationId,
          registrationId
        )
        const payload = JSON.parse(response.payload)

        expect(payload.periods).toStrictEqual([])
      })
    })

    describe('registration not found', () => {
      it('returns 404', async () => {
        const { server, organisationId } = await createServer()
        const unknownRegId = new ObjectId().toString()

        const response = await makeRequest(server, organisationId, unknownRegId)

        expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
      })
    })
  })

  describe('when feature flag is disabled', () => {
    it('returns 404', async () => {
      const organisationId = new ObjectId().toString()
      const registrationId = new ObjectId().toString()

      const server = await createTestServer({
        repositories: {},
        featureFlags: createInMemoryFeatureFlags({ reports: false })
      })

      const response = await server.inject({
        method: 'GET',
        url: makeUrl(organisationId, registrationId),
        ...asStandardUser({ linkedOrgId: organisationId })
      })

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
    })
  })
})
