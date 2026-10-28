import { createOrganisationBuilders } from '#repositories/organisations/contract/test-data.js'
import { it as mongoIt } from '#vite/fixtures/mongo.js'
import { MongoClient, ObjectId } from 'mongodb'
import { describe, expect, vi } from 'vitest'

import { logger } from '#common/helpers/logging/logger.js'
import { createOrganisationsRepository } from '#repositories/organisations/mongodb.js'
import { createApprovedOrgBuilder } from '#vite/helpers/build-approved-org.js'
import { partialMock } from '#test/type-helpers.js'
import { buildLedgerEvent } from '#waste-balances/repository/ledger-test-data.js'
import { ensureLedgerCollection } from '#waste-balances/repository/ledger-mongodb.js'
import { config } from '../config.js'

import { runLedgerEventNumbersBackfill } from './run.js'

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
 * Events as stored before the numbers were written beside the ids, numbered
 * from 1 within their ledger.
 *
 * @param {*} ledgerId
 * @param {number} count
 */
const eventsWithoutNumbers = (ledgerId, count) =>
  Array.from({ length: count }, (_, index) => {
    const {
      organisationNumber: _organisationNumber,
      registrationNumber: _registrationNumber,
      accreditationNumber: _accreditationNumber,
      ...storedWithoutNumbers
    } = buildLedgerEvent({ ...ledgerId, number: index + 1 })
    return storedWithoutNumbers
  })

/** @param {Db} database */
const seed = async (database) => {
  const collection = await ensureLedgerCollection(database)
  await collection.deleteMany({})
  await database.collection('system-logs').deleteMany({})
  await database.collection('epr-organisations').deleteMany({})

  const organisation = await buildApprovedOrg(
    (await createOrganisationsRepository(database))()
  )
  const [registration] = organisation.registrations
  const [accreditation] = organisation.accreditations

  const accredited = {
    organisationId: organisation.id,
    registrationId: registration.id,
    accreditationId: accreditation.id
  }
  const registeredOnly = { ...accredited, accreditationId: null }
  const organisationGone = {
    organisationId: missingOrganisationId,
    registrationId: new ObjectId().toString(),
    accreditationId: null
  }

  await collection.insertMany([
    ...eventsWithoutNumbers(accredited, 2),
    ...eventsWithoutNumbers(registeredOnly, 1),
    ...eventsWithoutNumbers(organisationGone, 2)
  ])

  const numbers = {
    organisationNumber: String(organisation.orgId),
    registrationNumber: registration.registrationNumber
  }

  return {
    collection,
    accredited,
    registeredOnly,
    unmappedReasons: `unmappedReasons="organisation not found: 1 (${missingOrganisationId}/${organisationGone.registrationId}/null (2))"`,
    accreditedNumbers: {
      ...numbers,
      accreditationNumber: accreditation.accreditationNumber
    },
    registeredOnlyNumbers: { ...numbers, accreditationNumber: null }
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
      key === 'featureFlags.ledgerEventNumbersBackfill' ? enabled : undefined
    )

describe('runLedgerEventNumbersBackfill (mongo)', () => {
  it('dry run writes and audits nothing, and reports what it cannot map', async (/** @type {*} */ {
    database
  }) => {
    const { collection, unmappedReasons } = await seed(database)
    enableBackfill(false)

    await runLedgerEventNumbersBackfill(serverFor(database))

    expect(
      await collection.countDocuments({ organisationNumber: { $exists: true } })
    ).toBe(0)
    expect(await database.collection('system-logs').countDocuments()).toBe(0)
    expect(logger.info).toHaveBeenCalledWith({
      message: `Ledger event numbers backfill (dry-run): missing=5 mapped=3 unmapped=2 failedLedgers=0 auditFailedLedgers=0 ${unmappedReasons}`
    })
  })

  it('adds the numbers, audits each ledger and is idempotent', async (/** @type {*} */ {
    database
  }) => {
    const {
      collection,
      accredited,
      registeredOnly,
      unmappedReasons,
      accreditedNumbers,
      registeredOnlyNumbers
    } = await seed(database)
    enableBackfill(true)
    const server = serverFor(database)

    await runLedgerEventNumbersBackfill(server)
    await runLedgerEventNumbersBackfill(server)

    expect(await collection.find(accredited).toArray()).toEqual([
      expect.objectContaining(accreditedNumbers),
      expect.objectContaining(accreditedNumbers)
    ])
    expect(await collection.find(registeredOnly).toArray()).toEqual([
      expect.objectContaining(registeredOnlyNumbers)
    ])
    expect(
      await collection.countDocuments({
        organisationId: missingOrganisationId,
        organisationNumber: { $exists: true }
      })
    ).toBe(0)

    const logs = await database.collection('system-logs').find().toArray()
    expect(logs.map(({ context }) => context)).toEqual(
      expect.arrayContaining([
        { ...accredited, events: 2, next: accreditedNumbers },
        { ...registeredOnly, events: 1, next: registeredOnlyNumbers }
      ])
    )
    expect(logs).toHaveLength(2)
    expect(logs[0].createdBy.id).toBe('system')
    expect(logs[0].event.action).toBe('numbers-backfill-migration')

    expect(logger.info).toHaveBeenCalledWith({
      message: `Ledger event numbers backfill (backfill): missing=2 mapped=0 unmapped=2 failedLedgers=0 auditFailedLedgers=0 ${unmappedReasons}`
    })
  })
})
