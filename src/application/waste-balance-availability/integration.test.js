import { describe, beforeEach, expect } from 'vitest'
import { it as mongoIt } from '#vite/fixtures/mongo.js'
import { MongoClient, ObjectId } from 'mongodb'
import { aggregateAvailableBalance } from './aggregate-available-balance.js'
import {
  MATERIAL,
  GLASS_RECYCLING_PROCESS
} from '#domain/organisations/model.js'

const DATABASE_NAME = 'epr-backend'
const ORGANISATIONS_COLLECTION = 'epr-organisations'
const WASTE_BALANCE_EVENTS_COLLECTION = 'waste-balance-events'

const it = mongoIt.extend({
  mongoClient: async ({ db }, use) => {
    const client = await MongoClient.connect(db)
    await use(client)
    await client.close()
  }
})

const createOrganisation = (id, registrations) => ({
  _id: new ObjectId(id),
  orgId: 12345,
  version: 1,
  schemaVersion: 1,
  registrations
})

const createRegistration = (
  id,
  material,
  glassRecyclingProcess,
  accreditationId
) => ({
  id,
  material,
  status: 'approved',
  ...(glassRecyclingProcess && { glassRecyclingProcess }),
  ...(accreditationId && { accreditationId })
})

const createLedgerEvent = (
  registrationId,
  accreditationId,
  number,
  availableAmount
) => ({
  registrationId,
  accreditationId,
  number,
  closingBalance: { amount: availableAmount, availableAmount }
})

describe('aggregateAvailableBalance - Integration', () => {
  const orgId1 = '507f1f77bcf86cd799439011'
  const orgId2 = '507f1f77bcf86cd799439012'
  const regId1 = 'REG-001'
  const regId2 = 'REG-002'
  const regId3 = 'REG-003'
  const accId1 = 'ACC-001'
  const accId2 = 'ACC-002'
  const accId3 = 'ACC-003'

  let db

  beforeEach(
    async (
      /** @type {{ mongoClient: import('mongodb').MongoClient }} */ {
        mongoClient
      }
    ) => {
      db = mongoClient.db(DATABASE_NAME)
      await db.collection(ORGANISATIONS_COLLECTION).deleteMany({})
      await db.collection(WASTE_BALANCE_EVENTS_COLLECTION).deleteMany({})
    }
  )

  it('aggregates available balance by material', async () => {
    await db
      .collection(ORGANISATIONS_COLLECTION)
      .insertOne(
        createOrganisation(orgId1, [
          createRegistration(regId1, MATERIAL.PLASTIC, null, accId1)
        ])
      )

    await db
      .collection(WASTE_BALANCE_EVENTS_COLLECTION)
      .insertOne(createLedgerEvent(regId1, accId1, 1, 100))

    const result = await aggregateAvailableBalance(db)

    expect(result.materials).toContainEqual({
      material: MATERIAL.PLASTIC,
      availableAmount: 100
    })
  })

  it('aggregates balance for glass_re_melt', async () => {
    await db
      .collection(ORGANISATIONS_COLLECTION)
      .insertOne(
        createOrganisation(orgId1, [
          createRegistration(
            regId1,
            MATERIAL.GLASS,
            [GLASS_RECYCLING_PROCESS.GLASS_RE_MELT],
            accId1
          )
        ])
      )

    await db
      .collection(WASTE_BALANCE_EVENTS_COLLECTION)
      .insertOne(createLedgerEvent(regId1, accId1, 1, 200))

    const result = await aggregateAvailableBalance(db)

    expect(result.materials).toContainEqual({
      material: GLASS_RECYCLING_PROCESS.GLASS_RE_MELT,
      availableAmount: 200
    })
    expect(result.total).toBe(200)
  })

  it('aggregates balance for glass_other', async () => {
    await db
      .collection(ORGANISATIONS_COLLECTION)
      .insertOne(
        createOrganisation(orgId1, [
          createRegistration(
            regId1,
            MATERIAL.GLASS,
            [GLASS_RECYCLING_PROCESS.GLASS_OTHER],
            accId1
          )
        ])
      )

    await db
      .collection(WASTE_BALANCE_EVENTS_COLLECTION)
      .insertOne(createLedgerEvent(regId1, accId1, 1, 150))

    const result = await aggregateAvailableBalance(db)

    expect(result.materials).toContainEqual({
      material: GLASS_RECYCLING_PROCESS.GLASS_OTHER,
      availableAmount: 150
    })
    expect(result.total).toBe(150)
  })

  it('aggregates glass_re_melt and glass_other separately', async () => {
    const regId4 = 'REG-004'
    const accId4 = 'ACC-004'

    await db
      .collection(ORGANISATIONS_COLLECTION)
      .insertOne(
        createOrganisation(orgId1, [
          createRegistration(
            regId1,
            MATERIAL.GLASS,
            [GLASS_RECYCLING_PROCESS.GLASS_RE_MELT],
            accId1
          ),
          createRegistration(
            regId4,
            MATERIAL.GLASS,
            [GLASS_RECYCLING_PROCESS.GLASS_OTHER],
            accId4
          )
        ])
      )

    await db
      .collection(WASTE_BALANCE_EVENTS_COLLECTION)
      .insertMany([
        createLedgerEvent(regId1, accId1, 1, 100),
        createLedgerEvent(regId4, accId4, 1, 75)
      ])

    const result = await aggregateAvailableBalance(db)

    expect(result.materials).toContainEqual({
      material: GLASS_RECYCLING_PROCESS.GLASS_RE_MELT,
      availableAmount: 100
    })
    expect(result.materials).toContainEqual({
      material: GLASS_RECYCLING_PROCESS.GLASS_OTHER,
      availableAmount: 75
    })
    expect(result.total).toBe(175)
  })

  it('aggregates balances across multiple materials and organisations', async () => {
    await db
      .collection(ORGANISATIONS_COLLECTION)
      .insertMany([
        createOrganisation(orgId1, [
          createRegistration(regId1, MATERIAL.PLASTIC, null, accId1),
          createRegistration(
            regId2,
            MATERIAL.GLASS,
            [GLASS_RECYCLING_PROCESS.GLASS_RE_MELT],
            accId2
          )
        ]),
        createOrganisation(orgId2, [
          createRegistration(regId3, MATERIAL.PLASTIC, null, accId3)
        ])
      ])

    await db
      .collection(WASTE_BALANCE_EVENTS_COLLECTION)
      .insertMany([
        createLedgerEvent(regId1, accId1, 1, 100),
        createLedgerEvent(regId2, accId2, 1, 50),
        createLedgerEvent(regId3, accId3, 1, 200)
      ])

    const result = await aggregateAvailableBalance(db)

    expect(result.materials).toContainEqual({
      material: MATERIAL.PLASTIC,
      availableAmount: 300
    })
    expect(result.materials).toContainEqual({
      material: GLASS_RECYCLING_PROCESS.GLASS_RE_MELT,
      availableAmount: 50
    })
    expect(result.total).toBe(350)
  })

  it('excludes stream events with no matching registration', async () => {
    await db
      .collection(ORGANISATIONS_COLLECTION)
      .insertOne(
        createOrganisation(orgId1, [
          createRegistration(regId1, MATERIAL.PLASTIC, null, accId1)
        ])
      )

    await db
      .collection(WASTE_BALANCE_EVENTS_COLLECTION)
      .insertMany([
        createLedgerEvent(regId1, accId1, 1, 100),
        createLedgerEvent('REG-NO-REG', 'ACC-NO-REG', 1, 999)
      ])

    const result = await aggregateAvailableBalance(db)

    expect(result.materials).toContainEqual({
      material: MATERIAL.PLASTIC,
      availableAmount: 100
    })
    expect(result.total).toBe(100)
  })

  it('excludes registrations with no accreditation', async () => {
    await db
      .collection(ORGANISATIONS_COLLECTION)
      .insertOne(
        createOrganisation(orgId1, [
          createRegistration(regId1, MATERIAL.PLASTIC, null, accId1),
          createRegistration(regId2, MATERIAL.PLASTIC, null, null)
        ])
      )

    await db
      .collection(WASTE_BALANCE_EVENTS_COLLECTION)
      .insertOne(createLedgerEvent(regId1, accId1, 1, 100))

    const result = await aggregateAvailableBalance(db)

    expect(result.materials).toContainEqual({
      material: MATERIAL.PLASTIC,
      availableAmount: 100
    })
    expect(result.total).toBe(100)
  })

  it('returns all materials with zero balance when no data exists', async () => {
    const result = await aggregateAvailableBalance(db)

    const expectedMaterials = [
      ...Object.values(MATERIAL).filter((m) => m !== MATERIAL.GLASS),
      ...Object.values(GLASS_RECYCLING_PROCESS)
    ]

    expect(result.materials).toHaveLength(expectedMaterials.length)
    expectedMaterials.forEach((material) => {
      expect(result.materials).toContainEqual({ material, availableAmount: 0 })
    })
    expect(result.total).toBe(0)
  })

  it('returns generatedAt timestamp', async () => {
    const before = new Date().toISOString()
    const result = await aggregateAvailableBalance(db)
    const after = new Date().toISOString()

    expect(result.generatedAt).toBeDefined()
    expect(result.generatedAt >= before).toBe(true)
    expect(result.generatedAt <= after).toBe(true)
  })

  it('excludes accreditations from test organisations', async () => {
    const testOrgId = '507f1f77bcf86cd799439013'
    const testRegId = 'REG-TEST'
    const testAccId = 'ACC-TEST'

    await db.collection(ORGANISATIONS_COLLECTION).insertMany([
      {
        ...createOrganisation(testOrgId, [
          createRegistration(testRegId, MATERIAL.PLASTIC, null, testAccId)
        ]),
        orgId: 999999
      },
      createOrganisation(orgId1, [
        createRegistration(regId1, MATERIAL.PLASTIC, null, accId1)
      ])
    ])

    await db
      .collection(WASTE_BALANCE_EVENTS_COLLECTION)
      .insertMany([
        createLedgerEvent(testRegId, testAccId, 1, 500),
        createLedgerEvent(regId1, accId1, 1, 100)
      ])

    const result = await aggregateAvailableBalance(db)

    expect(result.materials).toContainEqual({
      material: MATERIAL.PLASTIC,
      availableAmount: 100
    })
    expect(result.total).toBe(100)
  })

  it('uses the latest stream closing balance', async () => {
    await db
      .collection(ORGANISATIONS_COLLECTION)
      .insertOne(
        createOrganisation(orgId1, [
          createRegistration(regId1, MATERIAL.PLASTIC, null, accId1)
        ])
      )

    await db
      .collection(WASTE_BALANCE_EVENTS_COLLECTION)
      .insertMany([
        createLedgerEvent(regId1, accId1, 1, 250),
        createLedgerEvent(regId1, accId1, 2, 175)
      ])

    const result = await aggregateAvailableBalance(db)

    expect(result.materials).toContainEqual({
      material: MATERIAL.PLASTIC,
      availableAmount: 175
    })
    expect(result.total).toBe(175)
  })

  it('reports zero when the stream is empty', async () => {
    await db
      .collection(ORGANISATIONS_COLLECTION)
      .insertOne(
        createOrganisation(orgId1, [
          createRegistration(regId1, MATERIAL.PLASTIC, null, accId1)
        ])
      )

    const result = await aggregateAvailableBalance(db)

    expect(result.materials).toContainEqual({
      material: MATERIAL.PLASTIC,
      availableAmount: 0
    })
    expect(result.total).toBe(0)
  })
})
