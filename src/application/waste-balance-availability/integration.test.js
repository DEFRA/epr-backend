import { describe, beforeEach, expect } from 'vitest'
import { ObjectId } from 'mongodb'
import { it, DATABASE_NAME } from '#vite/fixtures/mongo-client.js'
import { aggregateAvailableBalance } from './aggregate-available-balance.js'
import {
  MATERIAL,
  GLASS_RECYCLING_PROCESS,
  TONNAGE_BAND,
  WASTE_PROCESSING_TYPE
} from '#domain/organisations/model.js'
import {
  toAccreditationNumber,
  toOrganisationNumber,
  toRegistrationNumber
} from '#domain/organisations/numbers.js'
import { toYear } from '#common/helpers/dates/year.js'
import {
  createMongoLedgerRepository,
  WASTE_BALANCE_EVENTS_COLLECTION_NAME
} from '#waste-balances/repository/ledger-mongodb.js'
import { buildLedgerEvent } from '#waste-balances/repository/ledger-test-data.js'
import {
  createOrganisationReadRepository,
  EXTERNAL_ACCREDITATIONS_COLLECTION_NAME
} from '#organisation-read-model/repository/mongodb.js'
import { buildExternalAccreditation } from '#organisation-read-model/repository/contract/test-data.js'
import { createInMemoryOverseasSitesRepository } from '#overseas-sites/repository/inmemory.plugin.js'

const ORGANISATIONS_COLLECTION = 'epr-organisations'

// Configured as a test organisation in .vite/setup-files.js
const TEST_ORG_ID = 999999

const approvedStatusHistory = [
  { status: 'approved', updatedAt: new Date('2026-01-01T00:00:00.000Z') }
]

const contact = { email: 'contact@example.com', fullName: 'A Contact' }

/**
 * @typedef {Object} RegistrationSeed
 * @property {string} id
 * @property {string} [accreditationNumber] - absent for a registered-only registration
 * @property {string} material
 * @property {string[]} [glassRecyclingProcess]
 */

/** @param {RegistrationSeed} registration */
const materialOf = ({ material, glassRecyclingProcess }) => ({
  material,
  ...(glassRecyclingProcess && { glassRecyclingProcess })
})

/**
 * @param {string} id
 * @param {number} orgId
 * @param {RegistrationSeed[]} registrations
 */
const storedOrganisation = (id, orgId, registrations) => ({
  _id: new ObjectId(id),
  orgId,
  companyDetails: { name: 'Acme Reprocessing' },
  statusHistory: approvedStatusHistory,
  submittedToRegulator: 'ea',
  submitterContactDetails: contact,
  users: [],
  version: 1,
  accreditations: registrations
    .filter(({ accreditationNumber }) => accreditationNumber)
    .map((registration) => ({
      id: `acc-${registration.id}`,
      accreditationNumber: registration.accreditationNumber,
      ...materialOf(registration),
      prnIssuance: { tonnageBand: TONNAGE_BAND.UP_TO_5000 },
      statusHistory: approvedStatusHistory,
      validFrom: '2026-01-01'
    })),
  registrations: registrations.map((registration) => ({
    id: registration.id,
    registrationNumber: `REG-${registration.id}`,
    ...(registration.accreditationNumber && {
      accreditationId: `acc-${registration.id}`
    }),
    wasteProcessingType: WASTE_PROCESSING_TYPE.EXPORTER,
    statusHistory: approvedStatusHistory,
    validFrom: '2026-01-01',
    ...materialOf(registration),
    submittedToRegulator: 'ea',
    applicationContactDetails: contact,
    submitterContactDetails: contact,
    approvedPersons: []
  }))
})

/**
 * @param {number} orgId
 * @param {string} registrationId
 * @param {string} accreditationNumber
 */
const ledgerIdOf = (orgId, registrationId, accreditationNumber) => ({
  organisationNumber: toOrganisationNumber(String(orgId)),
  registrationNumber: toRegistrationNumber(`REG-${registrationId}`),
  accreditationNumber: toAccreditationNumber(accreditationNumber)
})

/**
 * @param {ReturnType<typeof ledgerIdOf>} ledgerId
 * @param {number} number
 * @param {number} availableAmount
 */
const ledgerEvent = (ledgerId, number, availableAmount) =>
  buildLedgerEvent({
    ...ledgerId,
    number,
    closingBalance: { amount: availableAmount, availableAmount }
  })

describe('aggregateAvailableBalance - Integration', () => {
  const orgId1 = 100001
  const orgId2 = 100002

  /** @type {import('mongodb').Db} */
  let db
  /** @type {import('#waste-balances/repository/ledger-port.js').WasteBalanceLedgerRepository} */
  let ledgerRepository
  /** @type {import('#organisation-read-model/repository/port.js').OrganisationReadRepository} */
  let organisationReadRepository

  const aggregate = () =>
    aggregateAvailableBalance(organisationReadRepository, ledgerRepository)

  beforeEach(
    async (
      /** @type {{ mongoClient: import('mongodb').MongoClient }} */ {
        mongoClient
      }
    ) => {
      db = mongoClient.db(DATABASE_NAME)
      ledgerRepository = (await createMongoLedgerRepository(db))()
      organisationReadRepository = createOrganisationReadRepository(db)({
        overseasSitesRepository: createInMemoryOverseasSitesRepository([])(),
        logger: { warn: () => {} }
      })
      await db.collection(ORGANISATIONS_COLLECTION).deleteMany({})
      await db
        .collection(EXTERNAL_ACCREDITATIONS_COLLECTION_NAME)
        .deleteMany({})
      await db.collection(WASTE_BALANCE_EVENTS_COLLECTION_NAME).deleteMany({})
    }
  )

  it('aggregates available balance by material', async () => {
    await db
      .collection(ORGANISATIONS_COLLECTION)
      .insertOne(
        storedOrganisation('507f1f77bcf86cd799439011', orgId1, [
          { id: '1', accreditationNumber: 'ACC-1', material: MATERIAL.PLASTIC }
        ])
      )
    await ledgerRepository.appendEvents([
      ledgerEvent(ledgerIdOf(orgId1, '1', 'ACC-1'), 1, 100)
    ])

    const result = await aggregate()

    expect(result.materials).toContainEqual({
      material: MATERIAL.PLASTIC,
      availableAmount: 100
    })
    expect(result.total).toBe(100)
  })

  it('aggregates glass_re_melt and glass_other separately', async () => {
    await db.collection(ORGANISATIONS_COLLECTION).insertOne(
      storedOrganisation('507f1f77bcf86cd799439011', orgId1, [
        {
          id: '1',
          accreditationNumber: 'ACC-1',
          material: MATERIAL.GLASS,
          glassRecyclingProcess: [GLASS_RECYCLING_PROCESS.GLASS_RE_MELT]
        },
        {
          id: '2',
          accreditationNumber: 'ACC-2',
          material: MATERIAL.GLASS,
          glassRecyclingProcess: [GLASS_RECYCLING_PROCESS.GLASS_OTHER]
        }
      ])
    )
    await ledgerRepository.appendEvents([
      ledgerEvent(ledgerIdOf(orgId1, '1', 'ACC-1'), 1, 100)
    ])
    await ledgerRepository.appendEvents([
      ledgerEvent(ledgerIdOf(orgId1, '2', 'ACC-2'), 1, 75)
    ])

    const result = await aggregate()

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
    await db.collection(ORGANISATIONS_COLLECTION).insertMany([
      storedOrganisation('507f1f77bcf86cd799439011', orgId1, [
        { id: '1', accreditationNumber: 'ACC-1', material: MATERIAL.PLASTIC },
        {
          id: '2',
          accreditationNumber: 'ACC-2',
          material: MATERIAL.GLASS,
          glassRecyclingProcess: [GLASS_RECYCLING_PROCESS.GLASS_RE_MELT]
        }
      ]),
      storedOrganisation('507f1f77bcf86cd799439012', orgId2, [
        { id: '3', accreditationNumber: 'ACC-3', material: MATERIAL.PLASTIC }
      ])
    ])
    await ledgerRepository.appendEvents([
      ledgerEvent(ledgerIdOf(orgId1, '1', 'ACC-1'), 1, 100)
    ])
    await ledgerRepository.appendEvents([
      ledgerEvent(ledgerIdOf(orgId1, '2', 'ACC-2'), 1, 50)
    ])
    await ledgerRepository.appendEvents([
      ledgerEvent(ledgerIdOf(orgId2, '3', 'ACC-3'), 1, 200)
    ])

    const result = await aggregate()

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

  it('includes an accreditation held outside re-ex', async () => {
    await db
      .collection(ORGANISATIONS_COLLECTION)
      .insertOne(
        storedOrganisation('507f1f77bcf86cd799439011', orgId1, [
          { id: '1', material: MATERIAL.PLASTIC }
        ])
      )
    await db.collection(EXTERNAL_ACCREDITATIONS_COLLECTION_NAME).insertOne(
      buildExternalAccreditation({
        registrationNumber: toRegistrationNumber('REG-1'),
        year: toYear(2026),
        accreditationNumber: toAccreditationNumber('ACC-EXTERNAL'),
        status: {
          current: 'approved',
          timeline: [
            {
              status: 'approved',
              at: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-01T00:00:00.000Z'
            }
          ]
        }
      })
    )
    await ledgerRepository.appendEvents([
      ledgerEvent(ledgerIdOf(orgId1, '1', 'ACC-EXTERNAL'), 1, 80)
    ])

    const result = await aggregate()

    expect(result.materials).toContainEqual({
      material: MATERIAL.PLASTIC,
      availableAmount: 80
    })
    expect(result.total).toBe(80)
  })

  it('excludes ledgers no accreditation in the read model holds', async () => {
    await db
      .collection(ORGANISATIONS_COLLECTION)
      .insertOne(
        storedOrganisation('507f1f77bcf86cd799439011', orgId1, [
          { id: '1', accreditationNumber: 'ACC-1', material: MATERIAL.PLASTIC }
        ])
      )
    await ledgerRepository.appendEvents([
      ledgerEvent(ledgerIdOf(orgId1, '1', 'ACC-1'), 1, 100)
    ])
    await ledgerRepository.appendEvents([
      ledgerEvent(ledgerIdOf(orgId1, 'NO-REG', 'ACC-NO-REG'), 1, 999)
    ])

    const result = await aggregate()

    expect(result.total).toBe(100)
  })

  it('excludes registrations with no accreditation', async () => {
    await db.collection(ORGANISATIONS_COLLECTION).insertOne(
      storedOrganisation('507f1f77bcf86cd799439011', orgId1, [
        { id: '1', accreditationNumber: 'ACC-1', material: MATERIAL.PLASTIC },
        { id: '2', material: MATERIAL.PLASTIC }
      ])
    )
    await ledgerRepository.appendEvents([
      ledgerEvent(ledgerIdOf(orgId1, '1', 'ACC-1'), 1, 100)
    ])
    await ledgerRepository.appendEvents([
      buildLedgerEvent({
        ...ledgerIdOf(orgId1, '2', 'unused'),
        accreditationNumber: null,
        closingBalance: { amount: 500, availableAmount: 500 }
      })
    ])

    const result = await aggregate()

    expect(result.total).toBe(100)
  })

  it('returns all materials with zero balance when no data exists', async () => {
    const result = await aggregate()

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
    const result = await aggregate()
    const after = new Date().toISOString()

    expect(result.generatedAt >= before).toBe(true)
    expect(result.generatedAt <= after).toBe(true)
  })

  it('excludes accreditations from test organisations', async () => {
    await db
      .collection(ORGANISATIONS_COLLECTION)
      .insertMany([
        storedOrganisation('507f1f77bcf86cd799439013', TEST_ORG_ID, [
          { id: 'T', accreditationNumber: 'ACC-T', material: MATERIAL.PLASTIC }
        ]),
        storedOrganisation('507f1f77bcf86cd799439011', orgId1, [
          { id: '1', accreditationNumber: 'ACC-1', material: MATERIAL.PLASTIC }
        ])
      ])
    await ledgerRepository.appendEvents([
      ledgerEvent(ledgerIdOf(TEST_ORG_ID, 'T', 'ACC-T'), 1, 500)
    ])
    await ledgerRepository.appendEvents([
      ledgerEvent(ledgerIdOf(orgId1, '1', 'ACC-1'), 1, 100)
    ])

    const result = await aggregate()

    expect(result.total).toBe(100)
  })

  it('uses the latest ledger closing balance', async () => {
    await db
      .collection(ORGANISATIONS_COLLECTION)
      .insertOne(
        storedOrganisation('507f1f77bcf86cd799439011', orgId1, [
          { id: '1', accreditationNumber: 'ACC-1', material: MATERIAL.PLASTIC }
        ])
      )
    await ledgerRepository.appendEvents([
      ledgerEvent(ledgerIdOf(orgId1, '1', 'ACC-1'), 1, 250),
      ledgerEvent(ledgerIdOf(orgId1, '1', 'ACC-1'), 2, 175)
    ])

    const result = await aggregate()

    expect(result.materials).toContainEqual({
      material: MATERIAL.PLASTIC,
      availableAmount: 175
    })
    expect(result.total).toBe(175)
  })

  it('reports zero when the ledger is empty', async () => {
    await db
      .collection(ORGANISATIONS_COLLECTION)
      .insertOne(
        storedOrganisation('507f1f77bcf86cd799439011', orgId1, [
          { id: '1', accreditationNumber: 'ACC-1', material: MATERIAL.PLASTIC }
        ])
      )

    const result = await aggregate()

    expect(result.materials).toContainEqual({
      material: MATERIAL.PLASTIC,
      availableAmount: 0
    })
    expect(result.total).toBe(0)
  })
})
