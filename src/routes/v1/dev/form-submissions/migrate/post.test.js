import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'
import { createFormSubmissionsRepository } from '#repositories/form-submissions/inmemory.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createTestServer } from '#test/create-test-server.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { StatusCodes } from 'http-status-codes'
import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'

function loadFixtures(fixtureType) {
  const fixturesDir = join(process.cwd(), `src/data/fixtures/ea/${fixtureType}`)
  const fixtureFiles = readdirSync(fixturesDir).filter((file) =>
    file.endsWith('.json')
  )

  return fixtureFiles.map((filename) => {
    const filePath = join(fixturesDir, filename)
    return JSON.parse(readFileSync(filePath, 'utf-8'))
  })
}

describe('POST /v1/dev/form-submissions/{id}/migrate', () => {
  setupAuthContext()
  let server
  let organisationsRepositoryFactory
  let organisationsRepository
  let formSubmissionsRepositoryFactory

  beforeEach(async () => {
    organisationsRepositoryFactory = createInMemoryOrganisationsRepository([])
    organisationsRepository = organisationsRepositoryFactory()
  })

  function createFormsRepo(
    orgFixtures = [],
    regFixtures = [],
    accFixtures = []
  ) {
    const orgFormSubmissions = orgFixtures.map((fixture) => ({
      id: fixture._id.$oid,
      orgId: fixture.orgId,
      rawSubmissionData: fixture.rawSubmissionData
    }))

    const regFormSubmissions = regFixtures.map((fixture) => ({
      id: fixture._id.$oid,
      orgId: fixture.orgId,
      referenceNumber: fixture.referenceNumber,
      rawSubmissionData: fixture.rawSubmissionData
    }))

    const accFormSubmissions = accFixtures.map((fixture) => ({
      id: fixture._id.$oid,
      orgId: fixture.orgId,
      referenceNumber: fixture.referenceNumber,
      rawSubmissionData: fixture.rawSubmissionData
    }))

    return createFormSubmissionsRepository(
      accFormSubmissions,
      regFormSubmissions,
      orgFormSubmissions
    )
  }

  async function setupServer(formsRepoFactory) {
    formSubmissionsRepositoryFactory = formsRepoFactory
    const featureFlags = createInMemoryFeatureFlags({ devEndpoints: true })

    server = await createTestServer({
      repositories: {
        organisationsRepository: organisationsRepositoryFactory,
        formSubmissionsRepository: formSubmissionsRepositoryFactory
      },
      featureFlags
    })
  }

  describe('feature flag disabled', () => {
    it('should return 404 when devEndpoints feature flag is disabled', async () => {
      const formsRepoFactory = createFormsRepo()
      const featureFlags = createInMemoryFeatureFlags({ devEndpoints: false })
      const testServer = await createTestServer({
        repositories: {
          organisationsRepository: organisationsRepositoryFactory,
          formSubmissionsRepository: formsRepoFactory
        },
        featureFlags
      })

      const response = await testServer.inject({
        method: 'POST',
        url: '/v1/dev/form-submissions/org-123/migrate'
      })

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
    })
  })

  describe('validation', () => {
    beforeEach(async () => {
      await setupServer(createFormsRepo())
    })

    it('should return 422 when id is empty', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/v1/dev/form-submissions/%20/migrate'
      })

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
      const body = JSON.parse(response.payload)
      expect(body.message).toBe('"id" cannot be empty')
    })
  })

  describe('not found', () => {
    beforeEach(async () => {
      await setupServer(createFormsRepo())
    })

    it('should return 404 when organisation submission does not exist', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/v1/dev/form-submissions/non-existent-org/migrate'
      })

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
      const body = JSON.parse(response.payload)
      expect(body.message).toBe(
        'Organisation form submission not found: non-existent-org'
      )
    })
  })

  describe('happy path', () => {
    it('should migrate organisation and return 200 with migrated data', async () => {
      const orgFixtures = loadFixtures('organisation')
      const orgFixture = orgFixtures[0]
      const orgId = orgFixture._id.$oid

      await setupServer(createFormsRepo([orgFixture]))

      const response = await server.inject({
        method: 'POST',
        url: `/v1/dev/form-submissions/${orgId}/migrate`
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
      const body = JSON.parse(response.payload)
      expect(body.migrated).toBeDefined()
      expect(body.migrated.organisation).toBe(true)
      expect(body.migrated.registrations).toBe(0)
      expect(body.migrated.accreditations).toBe(0)

      // Verify organisation was persisted
      const migratedOrg = await organisationsRepository.findById(orgId)
      expect(migratedOrg).toBeDefined()
      expect(migratedOrg.id).toBe(orgId)
    })

    it('should not require authentication', async () => {
      const orgFixtures = loadFixtures('organisation')
      const orgFixture = orgFixtures[0]

      await setupServer(createFormsRepo([orgFixture]))

      const response = await server.inject({
        method: 'POST',
        url: `/v1/dev/form-submissions/${orgFixture._id.$oid}/migrate`
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
    })

    it('should include Cache-Control header in response', async () => {
      const orgFixtures = loadFixtures('organisation')
      const orgFixture = orgFixtures[0]

      await setupServer(createFormsRepo([orgFixture]))

      const response = await server.inject({
        method: 'POST',
        url: `/v1/dev/form-submissions/${orgFixture._id.$oid}/migrate`
      })

      expect(response.headers['cache-control']).toBe(
        'no-cache, no-store, must-revalidate'
      )
    })

    it('should migrate organisation with related registrations', async () => {
      const orgFixtures = loadFixtures('organisation')
      const regFixtures = loadFixtures('registration')

      // Use an org that has matching registrations
      const orgFixture = orgFixtures[0]
      const orgId = orgFixture._id.$oid

      // Find registrations that reference this org
      const relatedRegs = regFixtures.filter(
        (r) => r.referenceNumber?.toLowerCase() === orgId.toLowerCase()
      )

      // If no related regs, modify a reg to reference this org
      const regsToUse =
        relatedRegs.length > 0
          ? relatedRegs
          : [{ ...regFixtures[0], referenceNumber: orgId }]

      await setupServer(createFormsRepo([orgFixture], regsToUse))

      const response = await server.inject({
        method: 'POST',
        url: `/v1/dev/form-submissions/${orgId}/migrate`
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
      const body = JSON.parse(response.payload)
      expect(body.migrated.organisation).toBe(true)
      expect(body.migrated.registrations).toBe(regsToUse.length)

      // Verify organisation was persisted with registrations
      // The exporter fixture has glass with both remelt and other processes,
      // which is split into 2 separate registrations at migration time
      const migratedOrg = await organisationsRepository.findById(orgId)
      expect(migratedOrg).toBeDefined()
      expect(migratedOrg.registrations).toHaveLength(2)
    })

    it('should migrate organisation with related accreditations', async () => {
      const orgFixtures = loadFixtures('organisation')
      const accFixtures = loadFixtures('accreditation')

      // Use an org that has matching accreditations
      const orgFixture = orgFixtures[0]
      const orgId = orgFixture._id.$oid

      // Find accreditations that reference this org
      const relatedAccs = accFixtures.filter(
        (a) => a.referenceNumber?.toLowerCase() === orgId.toLowerCase()
      )

      // If no related accs, modify an acc to reference this org
      const accsToUse =
        relatedAccs.length > 0
          ? relatedAccs
          : [{ ...accFixtures[0], referenceNumber: orgId }]

      await setupServer(createFormsRepo([orgFixture], [], accsToUse))

      const response = await server.inject({
        method: 'POST',
        url: `/v1/dev/form-submissions/${orgId}/migrate`
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
      const body = JSON.parse(response.payload)
      expect(body.migrated.organisation).toBe(true)
      expect(body.migrated.accreditations).toBe(accsToUse.length)

      // Verify organisation was persisted with accreditation
      const migratedOrg = await organisationsRepository.findById(orgId)
      expect(migratedOrg).toBeDefined()
      expect(migratedOrg.accreditations).toHaveLength(accsToUse.length)
    })
  })
})
