import { ObjectId } from 'mongodb'
import { StatusCodes } from 'http-status-codes'
import { createTestServer } from '#test/create-test-server.js'
import { asStandardUser } from '#test/inject-auth.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
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
    const createServer = async (registrationOverrides = {}) => {
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
          organisationsRepository: organisationsRepositoryFactory
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

      it('returns reportingPeriods with dueDate and report fields', async () => {
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
          expect(period).toHaveProperty('report', null)
        }
      })

      it('returns quarterly periods up to current quarter', async () => {
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

        const currentYear = new Date().getUTCFullYear()
        const currentQuarter = Math.floor(new Date().getUTCMonth() / 3) + 1

        expect(payload.reportingPeriods).toHaveLength(currentQuarter)
        expect(payload.reportingPeriods[0].year).toBe(currentYear)
        expect(payload.reportingPeriods[0].period).toBe(1)
        expect(payload.reportingPeriods[0].startDate).toBe(
          `${currentYear}-01-01`
        )
        expect(payload.reportingPeriods[0].endDate).toBe(`${currentYear}-03-31`)
      })

      it('computes dueDate as 20th of month following period end', async () => {
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

        const currentYear = new Date().getUTCFullYear()
        const q1 = payload.reportingPeriods.find((p) => p.period === 1)
        expect(q1.dueDate).toBe(`${currentYear}-04-20`)
      })

      it('returns report as null for all periods', async () => {
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

        expect(payload.reportingPeriods.every((p) => p.report === null)).toBe(
          true
        )
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

      it('returns monthly periods up to and including current month', async () => {
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
        expect(payload.reportingPeriods).toHaveLength(currentMonth)
        expect(payload.reportingPeriods[0].year).toBe(currentYear)
        expect(payload.reportingPeriods[0].period).toBe(1)
        expect(payload.reportingPeriods[0].startDate).toBe(
          `${currentYear}-01-01`
        )
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
