import { it as mongoIt } from '#vite/fixtures/mongo.js'
import { MongoClient, ObjectId } from 'mongodb'
import { describe, expect, vi } from 'vitest'

import { createOrganisationsRepository } from '#repositories/organisations/mongodb.js'
import {
  MATERIAL,
  REPROCESSING_TYPE,
  WASTE_PROCESSING_TYPE
} from '#domain/organisations/model.js'
import {
  buildAccreditation,
  buildRegistration
} from '#repositories/organisations/contract/test-data.js'
import { buildApprovedOrg } from '#vite/helpers/build-approved-org.js'
import { COLLECTION_NAME } from '#repositories/summary-logs/mongodb.js'
import { config } from '../config.js'

import { runSummaryLogYearBackfill } from './run.js'

vi.mock('#common/helpers/logging/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))
vi.mock('@defra/cdp-auditing', () => ({ audit: vi.fn() }))
vi.mock('../config.js', async (importOriginal) => {
  const actual = /** @type {*} */ (await importOriginal())
  return { config: { ...actual.config, get: vi.fn() } }
})

const DATABASE_NAME = 'epr-backend'

const it = mongoIt.extend({
  mongoClient: async (/** @type {*} */ { db }, use) => {
    const client = await MongoClient.connect(db)
    await use(client)
    await client.close()
  },
  database: async (/** @type {*} */ { mongoClient }, use) => {
    await use(mongoClient.db(DATABASE_NAME))
  }
})

const seed = async (/** @type {*} */ database) => {
  const collection = database.collection(COLLECTION_NAME)
  await collection.deleteMany({})
  await database.collection('system-logs').deleteMany({})
  await database.collection('epr-organisations').deleteMany({})

  const accreditationId = new ObjectId().toString()
  const organisation = await buildApprovedOrg(
    (await createOrganisationsRepository(database))(),
    {
      registrations: [
        buildRegistration({
          accreditationId,
          material: MATERIAL.PLASTIC,
          wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
          reprocessingType: REPROCESSING_TYPE.INPUT,
          glassRecyclingProcess: null
        })
      ],
      accreditations: [
        buildAccreditation({
          id: accreditationId,
          material: MATERIAL.PLASTIC,
          wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
          reprocessingType: REPROCESSING_TYPE.INPUT,
          glassRecyclingProcess: null
        })
      ]
    },
    { VALID_FROM: '2025-04-01', VALID_TO: '2025-12-31' }
  )
  const ref = {
    organisationId: organisation.id,
    registrationId: organisation.registrations[0].id
  }

  await collection.insertMany([
    { _id: 'no-year', version: 1, status: 'submitted', ...ref },
    { _id: 'null-year', version: 4, status: 'submitted', year: null, ...ref },
    {
      _id: 'scoped',
      version: 1,
      status: 'submitted',
      year: 2024,
      accreditationId: 'a1'
    }
  ])
  return collection
}

const serverFor = (/** @type {*} */ db) =>
  /** @type {*} */ ({
    db,
    locker: { lock: async () => ({ free: async () => {} }) }
  })

describe('runSummaryLogYearBackfill (mongo)', () => {
  it('dry run writes and audits nothing', async (/** @type {*} */ {
    database
  }) => {
    const collection = await seed(database)
    vi.mocked(config.get).mockImplementation((key) =>
      key === 'featureFlags.summaryLogYearBackfill' ? false : undefined
    )

    await runSummaryLogYearBackfill(serverFor(database))

    expect(await collection.countDocuments({ year: 2025 })).toBe(0)
    expect(await database.collection('system-logs').countDocuments()).toBe(0)
  })

  it('assigns the year through the repository, bumps the version, audits each change and is idempotent', async (/** @type {*} */ {
    database
  }) => {
    const collection = await seed(database)
    vi.mocked(config.get).mockImplementation((key) =>
      key === 'featureFlags.summaryLogYearBackfill' ? true : undefined
    )
    const server = serverFor(database)

    await runSummaryLogYearBackfill(server)
    await runSummaryLogYearBackfill(server)

    expect(await collection.findOne({ _id: 'no-year' })).toMatchObject({
      year: 2025,
      version: 2
    })
    expect(await collection.findOne({ _id: 'null-year' })).toMatchObject({
      year: 2025,
      version: 5
    })
    expect(await collection.findOne({ _id: 'scoped' })).toMatchObject({
      year: 2024,
      version: 1,
      accreditationId: 'a1'
    })

    const logs = await database.collection('system-logs').find().toArray()
    expect(logs).toHaveLength(2)
    expect(logs.map((l) => l.context)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          summaryLogId: 'null-year',
          previous: { year: null, version: 4 },
          next: { year: 2025, version: 5 }
        })
      ])
    )
    expect(logs[0].createdBy.id).toBe('system')
    expect(logs[0].event.action).toBe('year-backfill-migration')
  })
})
