import { StatusCodes } from 'http-status-codes'
import { createTestServer } from '#test/create-test-server.js'
import { asServiceMaintainer, asStandardUser } from '#test/inject-auth.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createInMemoryReportsRepository } from '#reports/repository/inmemory.js'
import {
  buildOrganisation,
  buildRegistration
} from '#repositories/organisations/contract/test-data.js'
import { getReportSubmissionsPath } from './submissions.js'

describe(`GET ${getReportSubmissionsPath}`, () => {
  setupAuthContext()

  const createServer = async (featureFlagOverrides = { reports: true }) => {
    const registration = buildRegistration({
      wasteProcessingType: 'reprocessor'
    })
    const org = buildOrganisation({ registrations: [registration] })

    const organisationsRepositoryFactory =
      createInMemoryOrganisationsRepository()
    const organisationsRepository = organisationsRepositoryFactory()
    await organisationsRepository.insert(org)

    const server = await createTestServer({
      repositories: {
        organisationsRepository: organisationsRepositoryFactory,
        reportsRepository: createInMemoryReportsRepository()
      },
      featureFlags: createInMemoryFeatureFlags(featureFlagOverrides)
    })

    return server
  }

  describe('when reports feature flag is enabled', () => {
    it('returns 200 for a service maintainer', async () => {
      const server = await createServer()

      const response = await server.inject({
        method: 'GET',
        url: getReportSubmissionsPath,
        ...asServiceMaintainer()
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
    })

    it('returns reportSubmissions array and generatedAt in the response', async () => {
      const server = await createServer()

      const response = await server.inject({
        method: 'GET',
        url: getReportSubmissionsPath,
        ...asServiceMaintainer()
      })

      const payload = JSON.parse(response.payload)
      expect(payload).toHaveProperty('reportSubmissions')
      expect(Array.isArray(payload.reportSubmissions)).toBe(true)
      expect(payload).toHaveProperty('generatedAt')
      expect(typeof payload.generatedAt).toBe('string')
    })

    it('returns 403 for a standard user', async () => {
      const registration = buildRegistration()
      const org = buildOrganisation({ registrations: [registration] })

      const organisationsRepositoryFactory =
        createInMemoryOrganisationsRepository()
      const organisationsRepository = organisationsRepositoryFactory()
      await organisationsRepository.insert(org)

      const server = await createServer()

      const response = await server.inject({
        method: 'GET',
        url: getReportSubmissionsPath,
        ...asStandardUser({ linkedOrgId: org.id })
      })

      expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
    })
  })

  describe('when reports feature flag is disabled', () => {
    it('returns 404', async () => {
      const server = await createServer({ reports: false })

      const response = await server.inject({
        method: 'GET',
        url: getReportSubmissionsPath,
        ...asServiceMaintainer()
      })

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
    })
  })
})
