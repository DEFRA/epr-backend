import { it as mongoIt } from '#vite/fixtures/mongo.js'
import { MongoClient, ObjectId } from 'mongodb'
import { randomUUID } from 'node:crypto'
import { describe, expect, vi } from 'vitest'

import { MONTHLY_PERIODS } from '#reports/domain/period-labels.js'
import { buildOverseasSite } from '#overseas-sites/repository/contract/test-data.js'
import { createOverseasSitesRepository } from '#overseas-sites/repository/mongodb.js'
import { buildDraftPrn } from '#packaging-recycling-notes/repository/contract/test-data.js'
import { createPackagingRecyclingNotesRepository } from '#packaging-recycling-notes/repository/mongodb.js'
import { buildCreateReportParams } from '#reports/repository/contract/test-data.js'
import { createReportsRepository } from '#reports/repository/mongodb.js'
import {
  buildOrganisation,
  buildRegistration
} from '#repositories/organisations/contract/test-data.js'
import { createOrganisationsRepository } from '#repositories/organisations/mongodb.js'
import { summaryLogFactory } from '#repositories/summary-logs/contract/test-data.js'
import { createSummaryLogsRepository } from '#repositories/summary-logs/mongodb.js'
import { buildWasteBalance } from '#repositories/waste-balances/contract/test-data.js'
import {
  createWasteBalancesRepository,
  saveBalance
} from '#repositories/waste-balances/mongodb.js'
import {
  buildVersionData,
  toWasteRecordVersions
} from '#repositories/waste-records/contract/test-data.js'
import { createWasteRecordsRepository } from '#repositories/waste-records/mongodb.js'

import { createNonProdDataReset } from './mongodb.js'

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://signed.example')
}))

const DATABASE_NAME = 'epr-backend'

const COLLECTIONS = [
  'epr-organisations',
  'packaging-recycling-notes',
  'waste-balances',
  'reports',
  'waste-records',
  'summary-logs',
  'overseas-sites'
]

const mockS3Config = { s3Client: {}, preSignedUrlExpiry: 60 }
const mockLogger = {
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn()
}

const it = mongoIt.extend({
  mongoClient: async ({ db }, use) => {
    const client = await MongoClient.connect(db)
    await use(client)
    await client.close()
  },

  database: async ({ mongoClient }, use) => {
    const database = mongoClient.db(DATABASE_NAME)
    for (const name of COLLECTIONS) {
      await database.collection(name).deleteMany({})
    }
    await use(database)
  },

  repositories: async ({ database }, use) => {
    const organisationsFactory = await createOrganisationsRepository(database)
    const prnsFactory = await createPackagingRecyclingNotesRepository(
      database,
      []
    )
    const wasteBalancesFactory = await createWasteBalancesRepository(database)
    const reportsFactory = await createReportsRepository(database)
    const wasteRecordsFactory = await createWasteRecordsRepository(database)
    const summaryLogsFactory = await createSummaryLogsRepository(
      database,
      mockS3Config
    )
    const overseasSitesFactory = await createOverseasSitesRepository(database)

    await use({
      organisations: organisationsFactory(),
      prns: prnsFactory(),
      wasteBalances: wasteBalancesFactory(),
      reports: reportsFactory(),
      wasteRecords: wasteRecordsFactory(),
      summaryLogs: summaryLogsFactory(mockLogger),
      overseasSites: overseasSitesFactory(),
      wasteBalancesSave: saveBalance(database)
    })
  },

  reset: async ({ database }, use) => {
    await use(createNonProdDataReset(database))
  }
})

/**
 * Builds and inserts an organisation with a single exporter registration
 * that references two overseas sites created via the real adapter.
 * Returns the ids needed for seeding downstream data and for assertions.
 */
const seedOrganisationWithOverseasSites = async (repositories) => {
  const siteA = await repositories.overseasSites.create(
    buildOverseasSite({ name: 'Site A' })
  )
  const siteB = await repositories.overseasSites.create(
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

  await repositories.organisations.insert(organisation)

  return {
    organisation,
    organisationId: organisation.id,
    registrationId: organisation.registrations[0].id,
    accreditationId: organisation.accreditations[0].id,
    siteA,
    siteB
  }
}

const seedDownstreamForOrganisation = async (
  repositories,
  { organisationId, registrationId, accreditationId }
) => {
  await repositories.prns.create(
    buildDraftPrn({
      organisation: {
        id: organisationId,
        name: 'Target',
        tradingName: 'Target Trading'
      }
    })
  )

  // waste-balances has no public insert, so use the exported saveBalance
  // helper the real adapter uses under the hood.
  await repositories.wasteBalancesSave(
    buildWasteBalance({ accreditationId, organisationId }),
    []
  )

  await repositories.reports.createReport(
    buildCreateReportParams({
      organisationId,
      registrationId,
      cadence: 'monthly',
      period: MONTHLY_PERIODS.January
    })
  )

  const { version, data } = buildVersionData()
  await repositories.wasteRecords.appendVersions(
    organisationId,
    registrationId,
    toWasteRecordVersions({
      received: { 'row-1': { version, data } }
    })
  )

  await repositories.summaryLogs.insert(
    `summary-log-${randomUUID()}`,
    summaryLogFactory.validating({ organisationId, registrationId })
  )
}

const EMPTY_COUNTS = {
  'packaging-recycling-notes': 0,
  'waste-balances': 0,
  reports: 0,
  'waste-records': 0,
  'summary-logs': 0,
  'overseas-sites': 0,
  'epr-organisations': 0
}

describe('non-prod data reset (mongo)', () => {
  describe('deleteByOrgId', () => {
    it('cascades through every collection seeded via real repository adapters', async ({
      database,
      repositories,
      reset
    }) => {
      const seeded = await seedOrganisationWithOverseasSites(repositories)
      await seedDownstreamForOrganisation(repositories, seeded)
      // A second PRN so the deleteMany semantics get exercised.
      await repositories.prns.create(
        buildDraftPrn({
          organisation: {
            id: seeded.organisationId,
            name: 'Target',
            tradingName: 'Target Trading'
          }
        })
      )

      const counts = await reset.deleteByOrgId(seeded.organisationId)

      expect(counts).toEqual({
        'packaging-recycling-notes': 2,
        'waste-balances': 1,
        reports: 1,
        'waste-records': 1,
        'summary-logs': 1,
        'overseas-sites': 2,
        'epr-organisations': 1
      })

      for (const name of COLLECTIONS) {
        expect(
          await database.collection(name).countDocuments(),
          `${name} should be empty`
        ).toBe(0)
      }
    })

    it('leaves unrelated organisations and their downstream data untouched', async ({
      database,
      repositories,
      reset
    }) => {
      const target = await seedOrganisationWithOverseasSites(repositories)
      await seedDownstreamForOrganisation(repositories, target)

      const other = await seedOrganisationWithOverseasSites(repositories)
      await seedDownstreamForOrganisation(repositories, other)

      await reset.deleteByOrgId(target.organisationId)

      expect(
        await database
          .collection('packaging-recycling-notes')
          .countDocuments({ 'organisation.id': other.organisationId })
      ).toBe(1)
      expect(
        await database
          .collection('waste-balances')
          .countDocuments({ accreditationId: other.accreditationId })
      ).toBe(1)
      expect(
        await database
          .collection('reports')
          .countDocuments({ organisationId: other.organisationId })
      ).toBe(1)
      expect(
        await database
          .collection('waste-records')
          .countDocuments({ organisationId: other.organisationId })
      ).toBe(1)
      expect(
        await database
          .collection('summary-logs')
          .countDocuments({ organisationId: other.organisationId })
      ).toBe(1)
      expect(
        await database.collection('overseas-sites').countDocuments({
          _id: {
            $in: [
              ObjectId.createFromHexString(other.siteA.id),
              ObjectId.createFromHexString(other.siteB.id)
            ]
          }
        })
      ).toBe(2)
      expect(
        await database.collection('epr-organisations').countDocuments({
          _id: ObjectId.createFromHexString(other.organisationId)
        })
      ).toBe(1)
    })

    it('returns all-zero counts when the organisation does not exist', async ({
      reset
    }) => {
      const counts = await reset.deleteByOrgId(new ObjectId().toHexString())

      expect(counts).toEqual(EMPTY_COUNTS)
    })

    it('returns all-zero counts when the id is not a valid object id', async ({
      reset
    }) => {
      const counts = await reset.deleteByOrgId('not-an-object-id')

      expect(counts).toEqual(EMPTY_COUNTS)
    })

    it('is idempotent: a second call returns all zeros', async ({
      repositories,
      reset
    }) => {
      const seeded = await seedOrganisationWithOverseasSites(repositories)
      await seedDownstreamForOrganisation(repositories, seeded)

      const first = await reset.deleteByOrgId(seeded.organisationId)
      expect(first['epr-organisations']).toBe(1)
      expect(first['packaging-recycling-notes']).toBe(1)

      const second = await reset.deleteByOrgId(seeded.organisationId)
      expect(second).toEqual(EMPTY_COUNTS)
    })

    it('short-circuits waste-balances when the organisation has no accreditations', async ({
      database,
      reset
    }) => {
      // Raw insert: we are deliberately constructing a malformed org doc to
      // exercise the cascade's empty-accreditations branch, which bypasses
      // adapter-level validation.
      const orgId = new ObjectId()
      await database.collection('epr-organisations').insertOne({
        _id: orgId,
        accreditations: [],
        registrations: []
      })
      // An orphan waste-balance with an accreditation id the cascade should not touch.
      await database.collection('waste-balances').insertOne({
        _id: new ObjectId(),
        accreditationId: new ObjectId().toHexString()
      })

      const counts = await reset.deleteByOrgId(orgId.toHexString())

      expect(counts['waste-balances']).toBe(0)
      expect(await database.collection('waste-balances').countDocuments()).toBe(
        1
      )
    })

    it('short-circuits overseas-sites when the organisation has no overseas sites', async ({
      database,
      reset
    }) => {
      const orgId = new ObjectId()
      await database.collection('epr-organisations').insertOne({
        _id: orgId,
        accreditations: [],
        registrations: [{ id: new ObjectId().toHexString() }]
      })
      // An orphan overseas site the cascade should not touch.
      await database.collection('overseas-sites').insertOne({
        _id: new ObjectId(),
        name: 'Orphan'
      })

      const counts = await reset.deleteByOrgId(orgId.toHexString())

      expect(counts['overseas-sites']).toBe(0)
      expect(await database.collection('overseas-sites').countDocuments()).toBe(
        1
      )
    })

    it('handles an organisation document missing accreditations and registrations entirely', async ({
      database,
      reset
    }) => {
      // Raw insert of a skeletal org doc with only _id, to cover the
      // `?? []` fallbacks in extractCascadeKeys for both accreditations
      // and registrations. The unique index on `orgId` allows at most one
      // such null-orgId document at a time, which is fine for this branch.
      const orgId = new ObjectId()
      await database.collection('epr-organisations').insertOne({ _id: orgId })

      const counts = await reset.deleteByOrgId(orgId.toHexString())

      expect(counts['epr-organisations']).toBe(1)
      expect(counts['waste-balances']).toBe(0)
      expect(counts['overseas-sites']).toBe(0)
    })
  })
})
