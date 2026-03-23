import { ObjectId } from 'mongodb'
import { StatusCodes } from 'http-status-codes'
import { createTestServer } from '#test/create-test-server.js'
import { asStandardUser } from '#test/inject-auth.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createInMemoryReportsRepository } from '#reports/repository/inmemory.js'
import {
  buildOrganisation,
  buildRegistration
} from '#repositories/organisations/contract/test-data.js'
import { reportsGetPath } from './get.js'

describe(`GET ${reportsGetPath}`, () => {
  setupAuthContext()

  const makeUrl = (orgId, regId) =>
    `/v1/organisations/${orgId}/registrations/${regId}/reports/calendar`

  describe('when feature flag is enabled', () => {
    const createServer = async (
      registrationOverrides = {},
      reportsRepositoryFactory
    ) => {
      const registration = buildRegistration(registrationOverrides)
      const org = buildOrganisation({
        registrations: [registration]
      })

      const organisationsRepositoryFactory =
        createInMemoryOrganisationsRepository()
      const organisationsRepository = organisationsRepositoryFactory()
      await organisationsRepository.insert(org)

      const server = await createTestServer({
        repositories: {
          organisationsRepository: organisationsRepositoryFactory,
          ...(reportsRepositoryFactory && {
            reportsRepository: reportsRepositoryFactory
          })
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

      it('returns reportingPeriods with dueDate', async () => {
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

        for (const period of payload.reportingPeriods) {
          expect(period).toHaveProperty('dueDate')
        }
      })

      it('returns only ended quarterly periods', async () => {
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

        const currentQuarter = Math.floor(new Date().getUTCMonth() / 3) + 1
        const endedQuarters = currentQuarter - 1

        expect(payload.reportingPeriods).toHaveLength(endedQuarters)
      })

      it('does not include the current in-progress quarter', async () => {
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

        const currentQuarter = Math.floor(new Date().getUTCMonth() / 3) + 1
        const found = payload.reportingPeriods.find(
          (p) => p.period === currentQuarter
        )

        expect(found).toBeUndefined()
      })

      it('omits report field when no persisted report exists', async () => {
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

        expect(
          payload.reportingPeriods.every((p) => p.report === undefined)
        ).toBe(true)
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

      it('returns only ended monthly periods', async () => {
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

        const currentMonth = new Date().getUTCMonth() + 1
        const endedMonths = currentMonth - 1

        expect(payload.reportingPeriods).toHaveLength(endedMonths)
      })

      it('includes dueDate for each monthly period', async () => {
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

        const january = payload.reportingPeriods.find((p) => p.period === 1)
        expect(january.dueDate).toBe(`${currentYear}-02-20`)
      })
    })

    describe('with persisted reports', () => {
      it('includes report object for period with persisted report', async () => {
        const reportsRepositoryFactory = createInMemoryReportsRepository()
        const { server, organisationId, registrationId } = await createServer(
          {
            wasteProcessingType: 'exporter',
            accreditationId: new ObjectId().toString()
          },
          reportsRepositoryFactory
        )

        const reportsRepository = reportsRepositoryFactory()
        await reportsRepository.createReport({
          organisationId,
          registrationId,
          year: new Date().getUTCFullYear(),
          cadence: 'monthly',
          period: 1,
          startDate: `${new Date().getUTCFullYear()}-01-01`,
          endDate: `${new Date().getUTCFullYear()}-01-31`,
          dueDate: `${new Date().getUTCFullYear()}-02-20`,
          changedBy: { id: 'user-1', name: 'Test', position: 'Officer' },
          material: 'plastic',
          wasteProcessingType: 'exporter'
        })

        const response = await makeRequest(
          server,
          organisationId,
          registrationId
        )
        const payload = JSON.parse(response.payload)

        const january = payload.reportingPeriods.find((p) => p.period === 1)
        expect(january.report).toBeDefined()
        expect(january.report.id).toBeDefined()
        expect(january.report.status).toBe('in_progress')
      })

      it('handles deleted report (null currentReportId)', async () => {
        const reportsRepositoryFactory = createInMemoryReportsRepository()
        const { server, organisationId, registrationId } = await createServer(
          {
            wasteProcessingType: 'exporter',
            accreditationId: new ObjectId().toString()
          },
          reportsRepositoryFactory
        )

        const reportsRepository = reportsRepositoryFactory()
        await reportsRepository.createReport({
          organisationId,
          registrationId,
          year: new Date().getUTCFullYear(),
          cadence: 'monthly',
          period: 1,
          startDate: `${new Date().getUTCFullYear()}-01-01`,
          endDate: `${new Date().getUTCFullYear()}-01-31`,
          dueDate: `${new Date().getUTCFullYear()}-02-20`,
          changedBy: { id: 'user-1', name: 'Test', position: 'Officer' },
          material: 'plastic',
          wasteProcessingType: 'exporter'
        })

        await reportsRepository.deleteReport({
          organisationId,
          registrationId,
          year: new Date().getUTCFullYear(),
          cadence: 'monthly',
          period: 1,
          changedBy: { id: 'user-1', name: 'Test', position: 'Officer' }
        })

        const response = await makeRequest(
          server,
          organisationId,
          registrationId
        )
        const payload = JSON.parse(response.payload)

        const january = payload.reportingPeriods.find((p) => p.period === 1)
        expect(january.report).toBeUndefined()
      })

      it('omits report field for period without persisted report', async () => {
        const reportsRepositoryFactory = createInMemoryReportsRepository()
        const { server, organisationId, registrationId } = await createServer(
          {
            wasteProcessingType: 'exporter',
            accreditationId: new ObjectId().toString()
          },
          reportsRepositoryFactory
        )

        const reportsRepository = reportsRepositoryFactory()
        await reportsRepository.createReport({
          organisationId,
          registrationId,
          year: new Date().getUTCFullYear(),
          cadence: 'monthly',
          period: 1,
          startDate: `${new Date().getUTCFullYear()}-01-01`,
          endDate: `${new Date().getUTCFullYear()}-01-31`,
          dueDate: `${new Date().getUTCFullYear()}-02-20`,
          changedBy: { id: 'user-1', name: 'Test', position: 'Officer' },
          material: 'plastic',
          wasteProcessingType: 'exporter'
        })

        const response = await makeRequest(
          server,
          organisationId,
          registrationId
        )
        const payload = JSON.parse(response.payload)

        const february = payload.reportingPeriods.find((p) => p.period === 2)
        expect(february.report).toBeUndefined()
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
