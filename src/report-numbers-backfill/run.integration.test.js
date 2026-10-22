import { createOrganisationBuilders } from '#repositories/organisations/contract/test-data.js'
import { it as mongoIt } from '#vite/fixtures/mongo.js'
import { MongoClient, ObjectId } from 'mongodb'
import { randomUUID } from 'node:crypto'
import { describe, expect, vi } from 'vitest'

import { logger } from '#common/helpers/logging/logger.js'
import { createOrganisationsRepository } from '#repositories/organisations/mongodb.js'
import { createApprovedOrgBuilder } from '#vite/helpers/build-approved-org.js'
import { config } from '../config.js'

import { runReportNumbersBackfill } from './run.js'

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
const reportIds = {
  firstQuarter: randomUUID(),
  secondQuarter: randomUUID(),
  organisationGone: randomUUID()
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
 * A report as stored before the numbers were written beside the ids.
 * @param {string} id
 * @param {string} organisationId
 * @param {string} registrationId
 * @param {number} period
 */
const storedReport = (id, organisationId, registrationId, period) => ({
  id,
  version: 3,
  schemaVersion: 1,
  organisationId,
  registrationId,
  year: 2026,
  cadence: 'quarterly',
  period,
  submissionNumber: 1,
  startDate: '2026-01-01',
  endDate: '2026-03-31',
  dueDate: '2026-04-20',
  status: {
    currentStatus: 'submitted',
    currentStatusAt: '2026-04-01T00:00:00.000Z',
    history: []
  }
})

const seed = async (/** @type {*} */ database) => {
  const collection = database.collection('reports')
  await collection.deleteMany({})
  await database.collection('system-logs').deleteMany({})
  await database.collection('epr-organisations').deleteMany({})

  const organisation = await buildApprovedOrg(
    (await createOrganisationsRepository(database))()
  )
  const [registration] = organisation.registrations

  await collection.insertMany([
    storedReport(reportIds.firstQuarter, organisation.id, registration.id, 1),
    storedReport(reportIds.secondQuarter, organisation.id, registration.id, 2),
    storedReport(
      reportIds.organisationGone,
      missingOrganisationId,
      registration.id,
      1
    )
  ])

  return {
    collection,
    registrationId: registration.id,
    numbers: {
      organisationNumber: String(organisation.orgId),
      registrationNumber: registration.registrationNumber
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
      key === 'featureFlags.reportNumbersBackfill' ? enabled : undefined
    )

const unmappedLine = (/** @type {string} */ registrationId) =>
  `Report numbers unmapped: reportId=${reportIds.organisationGone} organisationId=${missingOrganisationId} registrationId=${registrationId} reasons="organisation ${missingOrganisationId} not found"`

const unmappedLines = () =>
  vi
    .mocked(logger.info)
    .mock.calls.map(([{ message }]) => message)
    .filter((message) => message?.startsWith('Report numbers unmapped'))

describe('runReportNumbersBackfill (mongo)', () => {
  it('dry run writes and audits nothing, and reports what it cannot map', async (/** @type {*} */ {
    database
  }) => {
    vi.mocked(logger.info).mockClear()
    const { collection, registrationId } = await seed(database)
    enableBackfill(false)

    await runReportNumbersBackfill(serverFor(database))

    expect(
      await collection.countDocuments({ organisationNumber: { $exists: true } })
    ).toBe(0)
    expect(await database.collection('system-logs').countDocuments()).toBe(0)
    expect(unmappedLines()).toEqual([unmappedLine(registrationId)])
    expect(logger.info).toHaveBeenCalledWith({
      message:
        'Report numbers backfill (dry-run): missing=3 mapped=2 unmapped=1 failed=0 auditFailed=0'
    })
  })

  it('adds the numbers, leaves the version alone, audits each change and is idempotent', async (/** @type {*} */ {
    database
  }) => {
    vi.mocked(logger.info).mockClear()
    const { collection, registrationId, numbers } = await seed(database)
    enableBackfill(true)
    const server = serverFor(database)

    await runReportNumbersBackfill(server)
    await runReportNumbersBackfill(server)

    for (const id of [reportIds.firstQuarter, reportIds.secondQuarter]) {
      expect(await collection.findOne({ id })).toMatchObject({
        ...numbers,
        version: 3
      })
    }
    expect(
      await collection.findOne({ id: reportIds.organisationGone })
    ).not.toHaveProperty('organisationNumber')

    const logs = await database.collection('system-logs').find().toArray()
    expect(logs.map(({ context }) => context)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          reportId: reportIds.firstQuarter,
          next: numbers
        }),
        expect.objectContaining({
          reportId: reportIds.secondQuarter,
          next: numbers
        })
      ])
    )
    expect(logs).toHaveLength(2)
    expect(logs[0].createdBy.id).toBe('system')
    expect(logs[0].event.action).toBe('numbers-backfill-migration')

    expect(unmappedLines()).toEqual([
      unmappedLine(registrationId),
      unmappedLine(registrationId)
    ])
    expect(logger.info).toHaveBeenCalledWith({
      message:
        'Report numbers backfill (backfill): missing=1 mapped=0 unmapped=1 failed=0 auditFailed=0'
    })
  })
})
