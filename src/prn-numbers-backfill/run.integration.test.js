import { createOrganisationBuilders } from '#repositories/organisations/contract/test-data.js'
import { it as mongoIt } from '#vite/fixtures/mongo.js'
import { MongoClient, ObjectId } from 'mongodb'
import { describe, expect, vi } from 'vitest'

import { logger } from '#common/helpers/logging/logger.js'
import { buildDraftPrn } from '#packaging-recycling-notes/repository/contract/test-data.js'
import { COLLECTION_NAME } from '#packaging-recycling-notes/repository/mongodb.js'
import { createOrganisationsRepository } from '#repositories/organisations/mongodb.js'
import { createApprovedOrgBuilder } from '#vite/helpers/build-approved-org.js'
import { partialMock } from '#test/type-helpers.js'
import { config } from '../config.js'

import { runPrnNumbersBackfill } from './run.js'

const organisationBuilders = createOrganisationBuilders()
const buildApprovedOrg = createApprovedOrgBuilder(organisationBuilders)

vi.mock('#common/helpers/logging/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))
vi.mock('@defra/cdp-auditing', () => ({ audit: vi.fn() }))
vi.mock('../config.js', async (importOriginal) => {
  const actual = /** @type {*} */ (await importOriginal())
  return {
    config: { ...actual.config, get: vi.fn((key) => actual.config.get(key)) }
  }
})

/** @import { Db } from 'mongodb' */

const DATABASE_NAME = 'epr-backend'
const missingOrganisationId = new ObjectId().toString()
const prnIds = {
  draft: new ObjectId(),
  issued: new ObjectId(),
  organisationGone: new ObjectId()
}

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

/**
 * A PRN as stored before the numbers were written beside the ids.
 *
 * @param {ObjectId} _id
 * @param {string} organisationId
 * @param {string} registrationId
 */
const storedPrn = (_id, organisationId, registrationId) => {
  const prn = buildDraftPrn()
  return {
    ...prn,
    _id,
    version: 3,
    organisation: { ...prn.organisation, id: organisationId },
    registrationId
  }
}

/** @param {Db} database */
const seed = async (database) => {
  const collection = database.collection(COLLECTION_NAME)
  await collection.deleteMany({})
  await database.collection('system-logs').deleteMany({})
  await database.collection('epr-organisations').deleteMany({})

  const organisation = await buildApprovedOrg(
    (await createOrganisationsRepository(database))()
  )
  const [registration] = organisation.registrations

  await collection.insertMany([
    storedPrn(prnIds.draft, organisation.id, registration.id),
    storedPrn(prnIds.issued, organisation.id, registration.id),
    storedPrn(prnIds.organisationGone, missingOrganisationId, registration.id)
  ])

  return {
    collection,
    numbers: {
      organisationNumber: String(organisation.orgId),
      registrationNumber: registration.registrationNumber
    }
  }
}

/** @param {Db} db */
const serverFor = (db) =>
  partialMock({
    db,
    locker: { lock: async () => ({ free: async () => {} }) }
  })

const enableBackfill = (/** @type {boolean} */ enabled) =>
  vi
    .mocked(config.get)
    .mockImplementation((key) =>
      key === 'featureFlags.prnNumbersBackfill' ? enabled : undefined
    )

const unmappedReasons = `unmappedReasons="organisation not found: 1 (${prnIds.organisationGone.toHexString()})"`

describe('runPrnNumbersBackfill (mongo)', () => {
  it('dry run writes and audits nothing, and reports what it cannot map', async (/** @type {*} */ {
    database
  }) => {
    const { collection } = await seed(database)
    enableBackfill(false)

    await runPrnNumbersBackfill(serverFor(database))

    expect(
      await collection.countDocuments({ registrationNumber: { $exists: true } })
    ).toBe(0)
    expect(await database.collection('system-logs').countDocuments()).toBe(0)
    expect(logger.info).toHaveBeenCalledWith({
      message: `PRN numbers backfill (dry-run): missing=3 mapped=2 unmapped=1 failed=0 auditFailed=0 ${unmappedReasons}`
    })
  })

  it('adds the numbers, leaves the version alone, audits each change and is idempotent', async (/** @type {*} */ {
    database
  }) => {
    const { collection, numbers } = await seed(database)
    enableBackfill(true)
    const server = serverFor(database)

    await runPrnNumbersBackfill(server)
    await runPrnNumbersBackfill(server)

    for (const _id of [prnIds.draft, prnIds.issued]) {
      expect(await collection.findOne({ _id })).toMatchObject({
        organisation: { organisationNumber: numbers.organisationNumber },
        registrationNumber: numbers.registrationNumber,
        version: 3
      })
    }
    const organisationGone = await collection.findOne({
      _id: prnIds.organisationGone
    })
    expect(organisationGone).not.toHaveProperty('registrationNumber')
    expect(organisationGone?.organisation).not.toHaveProperty(
      'organisationNumber'
    )

    const logs = await database.collection('system-logs').find().toArray()
    expect(logs.map(({ context }) => context)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          prnId: prnIds.draft.toHexString(),
          next: numbers
        }),
        expect.objectContaining({
          prnId: prnIds.issued.toHexString(),
          next: numbers
        })
      ])
    )
    expect(logs).toHaveLength(2)
    expect(logs[0].createdBy.id).toBe('system')
    expect(logs[0].event.action).toBe('numbers-backfill-migration')

    expect(logger.info).toHaveBeenCalledWith({
      message: `PRN numbers backfill (backfill): missing=1 mapped=0 unmapped=1 failed=0 auditFailed=0 ${unmappedReasons}`
    })
  })
})
