import Boom from '@hapi/boom'
import { MONTHLY_PERIODS } from '#reports/domain/period-labels.js'
import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'
import { buildOverseasSite } from '#overseas-sites/repository/contract/test-data.js'
import { createInMemoryOverseasSitesRepository } from '#overseas-sites/repository/inmemory.plugin.js'
import { buildDraftPrn } from '#packaging-recycling-notes/repository/contract/test-data.js'
import { createInMemoryPackagingRecyclingNotesRepository } from '#packaging-recycling-notes/repository/inmemory.plugin.js'
import { buildCreateReportParams } from '#reports/repository/contract/test-data.js'
import { createInMemoryReportsRepository } from '#reports/repository/inmemory.js'
import {
  buildOrganisation,
  buildRegistration
} from '#repositories/organisations/contract/test-data.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { summaryLogFactory } from '#repositories/summary-logs/contract/test-data.js'
import { createInMemorySummaryLogsRepository } from '#repositories/summary-logs/inmemory.js'
import { buildWasteBalance } from '#repositories/waste-balances/contract/test-data.js'
import { createInMemoryWasteBalancesRepository } from '#repositories/waste-balances/inmemory.js'
import {
  buildVersionData,
  toWasteRecordVersions
} from '#repositories/waste-records/contract/test-data.js'
import { createInMemoryWasteRecordsRepository } from '#repositories/waste-records/inmemory.js'
import { createTestServer } from '#test/create-test-server.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { StatusCodes } from 'http-status-codes'
import { ObjectId } from 'mongodb'
import { randomUUID } from 'node:crypto'

const EMPTY_COUNTS = {
  'packaging-recycling-notes': 0,
  'waste-balances': 0,
  reports: 0,
  'waste-records': 0,
  'summary-logs': 0,
  'overseas-sites': 0,
  'epr-organisations': 0
}

const buildAllInMemoryRepositories = () => ({
  organisationsRepository: createInMemoryOrganisationsRepository([]),
  packagingRecyclingNotesRepository:
    createInMemoryPackagingRecyclingNotesRepository([]),
  wasteBalancesRepository: createInMemoryWasteBalancesRepository([]),
  reportsRepository: createInMemoryReportsRepository(),
  wasteRecordsRepository: createInMemoryWasteRecordsRepository([]),
  summaryLogsRepository: createInMemorySummaryLogsRepository(),
  overseasSitesRepository: createInMemoryOverseasSitesRepository([])
})

describe('DELETE /v1/dev/organisations/{id}', () => {
  setupAuthContext()
  let server
  let repositories

  beforeEach(async () => {
    repositories = buildAllInMemoryRepositories()
    const featureFlags = createInMemoryFeatureFlags({
      devEndpoints: true,
      overseasSites: true
    })
    server = await createTestServer({ repositories, featureFlags })
  })

  describe('feature flag disabled', () => {
    it('returns 404 when devEndpoints feature flag is disabled', async () => {
      const repos = buildAllInMemoryRepositories()
      const featureFlags = createInMemoryFeatureFlags({
        devEndpoints: false,
        overseasSites: true
      })
      const testServer = await createTestServer({
        repositories: repos,
        featureFlags
      })

      const response = await testServer.inject({
        method: 'DELETE',
        url: `/v1/dev/organisations/${new ObjectId().toString()}`
      })

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
    })
  })

  describe('validation', () => {
    it('returns 422 when id is whitespace-only', async () => {
      const response = await server.inject({
        method: 'DELETE',
        url: '/v1/dev/organisations/%20%20%20'
      })

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
      const body = JSON.parse(response.payload)
      expect(body.message).toBe('"id" cannot be empty')
    })
  })

  describe('non-existent organisation', () => {
    it('returns 200 with all-zero counts when the org does not exist', async () => {
      const nonExistentId = new ObjectId().toString()

      const response = await server.inject({
        method: 'DELETE',
        url: `/v1/dev/organisations/${nonExistentId}`
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
      const body = JSON.parse(response.payload)
      expect(body).toEqual({
        orgId: nonExistentId,
        deletedCounts: EMPTY_COUNTS
      })
    })
  })

  describe('organisations repository errors', () => {
    it('propagates non-404 errors from findById', async () => {
      const repos = buildAllInMemoryRepositories()
      repos.organisationsRepository = () => ({
        findById: async () => {
          throw Boom.internal('database is on fire')
        }
      })
      const featureFlags = createInMemoryFeatureFlags({
        devEndpoints: true,
        overseasSites: true
      })
      const testServer = await createTestServer({
        repositories: repos,
        featureFlags
      })

      const response = await testServer.inject({
        method: 'DELETE',
        url: `/v1/dev/organisations/${new ObjectId().toString()}`
      })

      expect(response.statusCode).toBe(StatusCodes.INTERNAL_SERVER_ERROR)
    })
  })

  describe('not authenticated', () => {
    it('does not require authentication', async () => {
      const response = await server.inject({
        method: 'DELETE',
        url: `/v1/dev/organisations/${new ObjectId().toString()}`
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
    })
  })

  describe('happy path — full cascade', () => {
    it('deletes the organisation and all downstream data, returning per-collection counts', async () => {
      const overseasSitesRepo = repositories.overseasSitesRepository()

      // Create overseas sites first so we can reference their real ids from the org
      const siteA = await overseasSitesRepo.create(
        buildOverseasSite({ name: 'Site A' })
      )
      const siteB = await overseasSitesRepo.create(
        buildOverseasSite({ name: 'Site B' })
      )

      const organisation = buildOrganisation({
        registrations: [
          buildRegistration({
            wasteProcessingType: 'exporter',
            material: 'plastic',
            overseasSites: {
              '001': { overseasSiteId: siteA.id },
              '002': { overseasSiteId: siteB.id }
            }
          })
        ]
      })

      const orgRepo = repositories.organisationsRepository()
      await orgRepo.insert(organisation)

      const registrationId = organisation.registrations[0].id
      const accreditationId = organisation.accreditations[0].id

      // Seed downstream data in every collection the cascade is supposed to wipe
      const prnRepo = repositories.packagingRecyclingNotesRepository()
      await prnRepo.create(
        buildDraftPrn({
          organisation: {
            id: organisation.id,
            name: 'Target',
            tradingName: 'Target Trading'
          }
        })
      )
      await prnRepo.create(
        buildDraftPrn({
          organisation: {
            id: organisation.id,
            name: 'Target',
            tradingName: 'Target Trading'
          }
        })
      )

      // Waste-balances has no public insert method — use the test-only storage helper
      const wasteBalancesRepo = repositories.wasteBalancesRepository()
      wasteBalancesRepo._getStorageForTesting().push(
        buildWasteBalance({
          accreditationId,
          organisationId: organisation.id
        })
      )

      const reportsRepo = repositories.reportsRepository()
      await reportsRepo.createReport(
        buildCreateReportParams({
          organisationId: organisation.id,
          registrationId,
          cadence: 'monthly',
          period: MONTHLY_PERIODS.January
        })
      )

      const wasteRecordsRepo = repositories.wasteRecordsRepository()
      const { version, data } = buildVersionData()
      await wasteRecordsRepo.appendVersions(
        organisation.id,
        registrationId,
        toWasteRecordVersions({
          received: { 'row-1': { version, data } }
        })
      )

      const summaryLogsRepo = repositories.summaryLogsRepository()
      await summaryLogsRepo.insert(
        `summary-log-${randomUUID()}`,
        summaryLogFactory.validating({
          organisationId: organisation.id,
          registrationId
        })
      )

      const response = await server.inject({
        method: 'DELETE',
        url: `/v1/dev/organisations/${organisation.id}`
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
      const body = JSON.parse(response.payload)
      expect(body).toEqual({
        orgId: organisation.id,
        deletedCounts: {
          'packaging-recycling-notes': 2,
          'waste-balances': 1,
          reports: 1,
          'waste-records': 1,
          'summary-logs': 1,
          'overseas-sites': 2,
          'epr-organisations': 1
        }
      })

      // Organisation is gone
      await expect(orgRepo.findById(organisation.id)).rejects.toMatchObject({
        isBoom: true,
        output: { statusCode: StatusCodes.NOT_FOUND }
      })
      // Overseas sites are gone
      expect(await overseasSitesRepo.findById(siteA.id)).toBeNull()
      expect(await overseasSitesRepo.findById(siteB.id)).toBeNull()
      // Waste balance is gone
      expect(
        await wasteBalancesRepo.findByAccreditationId(accreditationId)
      ).toBeNull()
    })
  })

  describe('idempotency', () => {
    it('returns all-zero counts on a second call for the same id', async () => {
      const organisation = buildOrganisation()
      const orgRepo = repositories.organisationsRepository()
      await orgRepo.insert(organisation)

      const first = await server.inject({
        method: 'DELETE',
        url: `/v1/dev/organisations/${organisation.id}`
      })
      expect(first.statusCode).toBe(StatusCodes.OK)
      expect(JSON.parse(first.payload).deletedCounts['epr-organisations']).toBe(
        1
      )

      const second = await server.inject({
        method: 'DELETE',
        url: `/v1/dev/organisations/${organisation.id}`
      })

      expect(second.statusCode).toBe(StatusCodes.OK)
      expect(JSON.parse(second.payload)).toEqual({
        orgId: organisation.id,
        deletedCounts: EMPTY_COUNTS
      })
    })
  })
})
