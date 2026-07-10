import { StatusCodes } from 'http-status-codes'
import { createTestServer } from '#test/create-test-server.js'
import { asServiceMaintainer, asOperator } from '#test/inject-auth.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createInMemoryReportsRepository } from '#reports/repository/inmemory.js'
import {
  buildOrganisation,
  buildRegistration
} from '#repositories/organisations/contract/test-data.js'
import { buildApprovedOrg } from '#vite/helpers/build-approved-org.js'
import { buildSubmittedReport } from '#vite/helpers/build-submitted-report.js'
import { getReportSubmissionsPath } from './submissions.js'

describe(`GET ${getReportSubmissionsPath}`, () => {
  setupAuthContext()

  const createServer = async () => {
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
      }
    })

    return server
  }

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

  it('emits numeric tonnages as numbers through the response schema', async () => {
    const organisationsRepositoryFactory =
      createInMemoryOrganisationsRepository()
    const organisationsRepository = organisationsRepositoryFactory()
    const org = await buildApprovedOrg(organisationsRepository)

    const reportsRepositoryFactory = createInMemoryReportsRepository()
    const reportsRepository = reportsRepositoryFactory()
    await buildSubmittedReport(reportsRepository, {
      organisationId: org.id,
      registrationId: org.registrations[0].id,
      year: new Date().getUTCFullYear(),
      cadence: 'monthly',
      period: 1,
      prn: {
        issuedTonnage: 80,
        freeTonnage: 5,
        totalRevenue: 40000,
        averagePricePerTonne: 500
      }
    })

    const server = await createTestServer({
      repositories: {
        organisationsRepository: organisationsRepositoryFactory,
        reportsRepository: reportsRepositoryFactory
      }
    })

    const response = await server.inject({
      method: 'GET',
      url: getReportSubmissionsPath,
      ...asServiceMaintainer()
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
    const payload = JSON.parse(response.payload)
    const issued = payload.reportSubmissions.map(
      (r) => r.tonnagePrnsPernsIssued
    )
    // A real number survives the response schema (not coerced back to a string)
    expect(issued).toContain(80)
    // The submission number of the latest submitted report survives the schema
    const submissionNumbers = payload.reportSubmissions.map(
      (r) => r.submissionNumber
    )
    expect(submissionNumbers).toContain(1)
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
      ...asOperator()
    })

    expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
  })
})
