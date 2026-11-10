import { createOrganisationBuilders } from '#repositories/organisations/contract/test-data.js'
import { it as mongoIt } from '#vite/fixtures/mongo.js'
import { MongoClient, ObjectId } from 'mongodb'
import { describe, expect, vi } from 'vitest'

import { logger } from '#common/helpers/logging/logger.js'
import { createOrganisationsRepository } from '#repositories/organisations/mongodb.js'
import { createApprovedOrgBuilder } from '#vite/helpers/build-approved-org.js'
import { COLLECTION_NAME } from '#repositories/summary-logs/mongodb.js'
import { config } from '../config.js'

import { runSummaryLogScopeBackfill } from './run.js'

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
      meta: {
        PROCESSING_TYPE: 'REPROCESSOR_INPUT',
        ACCREDITATION_NUMBER: ` ${accreditation.accreditationNumber}`
      }
    },
    {
      _id: 'registered-only',
      version: 3,
      status: 'submitted',
      ...ids,
      meta: { PROCESSING_TYPE: 'EXPORTER_REGISTERED_ONLY' }
    },
    {
      _id: 'scoped',
      version: 1,
      status: 'submitted',
      ...ids,
      year: 2026,
      accreditationId: null,
      accreditationNumber: null
    },
    {
      _id: 'organisation-gone',
      version: 1,
      status: 'submitted',
      organisationId: missingOrganisationId,
      registrationId: registration.id,
      meta: {
        PROCESSING_TYPE: 'EXPORTER',
        ACCREDITATION_NUMBER: accreditation.accreditationNumber
      }
    }
  ])

  return { collection, accreditation }
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
      key === 'featureFlags.summaryLogScopeBackfill' ? enabled : undefined
    )

const infoLines = () =>
  vi.mocked(logger.info).mock.calls.map(([{ message }]) => message)

describe('runSummaryLogScopeBackfill (mongo)', () => {
  it('dry run writes and audits nothing, and reports what it would do', async (/** @type {*} */ {
    database
  }) => {
    vi.mocked(logger.info).mockClear()
    const { collection } = await seed(database)
    enableBackfill(false)

    await runSummaryLogScopeBackfill(serverFor(database))

    expect(await collection.countDocuments({ year: { $exists: true } })).toBe(1)
    expect(await database.collection('system-logs').countDocuments()).toBe(0)
    expect(infoLines()).toEqual(
      expect.arrayContaining([
        'Summary log scope backfill (dry-run): missing=3 inFlight=0 mapped=2 unmapped=1 yearSet=3 linkDiffers=0 failed=0 auditFailed=0',
        expect.stringMatching(
          /^Summary log accreditation unmapped: summaryLogId=organisation-gone .* reason="organisation \w+ not found"$/
        )
      ])
    )
  })

  it('writes the scope through the repository, bumps the version, audits each change and is idempotent', async (/** @type {*} */ {
    database
  }) => {
    vi.mocked(logger.info).mockClear()
    const { collection, accreditation } = await seed(database)
    enableBackfill(true)
    const server = serverFor(database)

    await runSummaryLogScopeBackfill(server)
    await runSummaryLogScopeBackfill(server)

    expect(await collection.findOne({ _id: 'accredited' })).toMatchObject({
      accreditationId: accreditation.id,
      accreditationNumber: accreditation.accreditationNumber,
      year: 2026,
      version: 2
    })
    expect(await collection.findOne({ _id: 'registered-only' })).toMatchObject({
      accreditationId: null,
      accreditationNumber: null,
      year: 2026,
      version: 4
    })
    expect(await collection.findOne({ _id: 'scoped' })).toMatchObject({
      version: 1
    })
    const gone = await collection.findOne({ _id: 'organisation-gone' })
    expect(gone).toMatchObject({ year: 2026, version: 2 })
    expect(gone).not.toHaveProperty('accreditationNumber')

    const logs = await database.collection('system-logs').find().toArray()
    expect(logs).toHaveLength(3)
    expect(logs[0].createdBy.id).toBe('system')
    expect(logs[0].event.action).toBe('scope-backfill-migration')

    expect(infoLines()).toEqual(
      expect.arrayContaining([
        'Summary log scope backfill (backfill): missing=3 inFlight=0 mapped=2 unmapped=1 yearSet=3 linkDiffers=0 failed=0 auditFailed=0',
        'Summary log scope backfill (backfill): missing=1 inFlight=0 mapped=0 unmapped=1 yearSet=0 linkDiffers=0 failed=0 auditFailed=0'
      ])
    )
  })
})
