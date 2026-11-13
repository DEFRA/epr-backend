import { currentUtcYear } from '#common/helpers/dates/year.js'
import { StatusCodes } from 'http-status-codes'
import { createTestServer } from '#test/create-test-server.js'
import { asServiceMaintainer, asOperator } from '#test/inject-auth.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { createInMemoryReportsRepository } from '#reports/repository/inmemory.js'
import { createInMemoryOrganisationReadRepository } from '#organisation-read-model/repository/inmemory.js'
import {
  buildReadApprovedOrganisation,
  buildReadOrganisation,
  buildReadReprocessorRegistration
} from '#organisation-read-model/repository/read-model-test-data.js'
import { toRegistrationNumber } from '#domain/organisations/numbers.js'
import { buildSubmittedReport } from '#vite/helpers/build-submitted-report.js'
import { getReportSubmissionsPath } from './submissions.js'

describe(`GET ${getReportSubmissionsPath}`, () => {
  setupAuthContext()

  const createServer = async () => {
    const org = buildReadOrganisation({
      registrations: { R26ER5001180041PL: buildReadReprocessorRegistration() }
    })

    const server = await createTestServer({
      repositories: {
        organisationReadRepository: createInMemoryOrganisationReadRepository([
          org
        ]),
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
    const year = currentUtcYear()
    const org = buildReadApprovedOrganisation({ year })

    const reportsRepositoryFactory = createInMemoryReportsRepository()
    const reportsRepository = reportsRepositoryFactory()
    await buildSubmittedReport(reportsRepository, {
      organisationNumber: org.organisationNumber,
      registrationNumber: toRegistrationNumber(`REG${org.organisationNumber}`),
      year,
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
        organisationReadRepository: createInMemoryOrganisationReadRepository([
          org
        ]),
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
    const server = await createServer()

    const response = await server.inject({
      method: 'GET',
      url: getReportSubmissionsPath,
      ...asOperator()
    })

    expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
  })
})
