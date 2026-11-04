import { createOrganisationBuilders } from '#repositories/organisations/contract/test-data.js'
import { it as mongoIt } from '#vite/fixtures/mongo.js'
import { MongoClient, ObjectId } from 'mongodb'
import { describe, expect, vi } from 'vitest'

import { logger } from '#common/helpers/logging/logger.js'
import { createOrganisationsRepository } from '#repositories/organisations/mongodb.js'
import { createApprovedOrgBuilder } from '#vite/helpers/build-approved-org.js'
import { COLLECTION_NAME } from '#repositories/summary-logs/mongodb.js'
import { config } from '../config.js'

import { runSummaryLogNumbersBackfill } from './run.js'

const organisationBuilders = createOrganisationBuilders()
const buildApprovedOrg = createApprovedOrgBuilder(organisationBuilders)

vi.mock('#common/helpers/logging/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))
vi.mock('@defra/cdp-auditing', () => ({ audit: vi.fn() }))
vi.mock('../config.js', async (importOriginal) => {
  const actual = /** @type {*} */ (await importOriginal())
  return { config: { ...actual.config, get: vi.fn() } }
})

const DATABASE_NAME = 'epr-backend'
const missingOrganisationId = new ObjectId().toString()

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

  const organisation = await buildApprovedOrg(
    (await createOrganisationsRepository(database))()
  )
  const [registration] = organisation.registrations
  const [accreditation] = organisation.accreditations
  const ids = {
    organisationId: organisation.id,
    registrationId: registration.id
  }

  await collection.insertMany([
    {
      _id: 'accredited',
      version: 1,
      status: 'submitted',
      ...ids,
      year: 2026,
      accreditationId: accreditation.id
    },
    {
      _id: 'registered-only',
      version: 3,
      status: 'submitted',
      ...ids,
      year: 2026,
      accreditationId: null
    },
    { _id: 'legacy', version: 1, status: 'submitted', ...ids },
    {
      _id: 'organisation-gone',
      version: 1,
      status: 'submitted',
      organisationId: missingOrganisationId,
      registrationId: registration.id
    }
  ])

  return {
    collection,
    registrationId: registration.id,
    numbers: {
      organisationNumber: String(organisation.orgId),
      registrationNumber: registration.registrationNumber,
      accreditationNumber: accreditation.accreditationNumber
    }
  }
}

const serverFor = (/** @type {*} */ db) =>
  /** @type {*} */ ({
    db,
    locker: { lock: async () => ({ free: async () => {} }) }
  })

const enableBackfill = (/** @type {boolean} */ enabled) =>
  vi
    .mocked(config.get)
    .mockImplementation((key) =>
      key === 'featureFlags.summaryLogNumbersBackfill' ? enabled : undefined
    )

const unmappedLines = () =>
  vi
    .mocked(logger.info)
    .mock.calls.map(([{ message }]) => message)
    .filter((message) => message?.startsWith('Summary log numbers unmapped'))

describe('runSummaryLogNumbersBackfill (mongo)', () => {
  it('dry run writes and audits nothing, and reports what it cannot map', async (/** @type {*} */ {
    database
  }) => {
    vi.mocked(logger.info).mockClear()
    const { collection, registrationId } = await seed(database)
    enableBackfill(false)

    await runSummaryLogNumbersBackfill(serverFor(database))

    expect(
      await collection.countDocuments({ organisationNumber: { $exists: true } })
    ).toBe(0)
    expect(await database.collection('system-logs').countDocuments()).toBe(0)
    expect(unmappedLines()).toEqual([
      `Summary log numbers unmapped: summaryLogId=organisation-gone status=submitted organisationId=${missingOrganisationId} registrationId=${registrationId} accreditationId=undefined reasons="organisation ${missingOrganisationId} not found"`
    ])
  })

  it('adds the numbers through the repository, bumps the version, audits each change and is idempotent', async (/** @type {*} */ {
    database
  }) => {
    vi.mocked(logger.info).mockClear()
    const { collection, numbers } = await seed(database)
    enableBackfill(true)
    const server = serverFor(database)

    await runSummaryLogNumbersBackfill(server)
    await runSummaryLogNumbersBackfill(server)

    expect(await collection.findOne({ _id: 'accredited' })).toMatchObject({
      ...numbers,
      version: 2
    })
    expect(await collection.findOne({ _id: 'registered-only' })).toMatchObject({
      ...numbers,
      accreditationNumber: null,
      version: 4
    })
    const legacy = await collection.findOne({ _id: 'legacy' })
    expect(legacy).toMatchObject({
      organisationNumber: numbers.organisationNumber,
      registrationNumber: numbers.registrationNumber,
      version: 2
    })
    expect(legacy).not.toHaveProperty('accreditationNumber')
    expect(
      await collection.findOne({ _id: 'organisation-gone' })
    ).not.toHaveProperty('organisationNumber')

    const logs = await database.collection('system-logs').find().toArray()
    expect(logs).toHaveLength(3)
    expect(logs.map((l) => l.context)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          summaryLogId: 'registered-only',
          previous: { version: 3 },
          next: { ...numbers, accreditationNumber: null, version: 4 }
        })
      ])
    )
    expect(logs[0].createdBy.id).toBe('system')
    expect(logs[0].event.action).toBe('numbers-backfill-migration')

    expect(unmappedLines()).toHaveLength(2)
  })
})
