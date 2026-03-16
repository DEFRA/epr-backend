import { describe, beforeEach, expect } from 'vitest'
import { it as mongoIt } from '#vite/fixtures/mongo.js'
import { MongoClient, ObjectId } from 'mongodb'
import { aggregateTonnageByMaterial } from './aggregate-tonnage.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import {
  MATERIAL,
  GLASS_RECYCLING_PROCESS
} from '#domain/organisations/model.js'

const DATABASE_NAME = 'epr-backend'
const ORGANISATIONS_COLLECTION = 'epr-organisations'
const WASTE_RECORDS_COLLECTION = 'waste-records'

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

const createRegistration = (id, material, glassRecyclingProcess) => ({
  id,
  material,
  status: 'approved',
  ...(glassRecyclingProcess && { glassRecyclingProcess })
})

const createExporterWasteRecord = (
  organisationId,
  registrationId,
  tonnage,
  dateOfExport
) => ({
  organisationId,
  registrationId,
  rowId: `row-${Math.random()}`,
  type: WASTE_RECORD_TYPE.EXPORTED,
  data: {
    processingType: PROCESSING_TYPES.EXPORTER,
    TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: tonnage,
    DATE_OF_EXPORT: dateOfExport
  },
  versions: []
})

const createExporterInterimSiteWasteRecord = (
  organisationId,
  registrationId,
  tonnage,
  dateOfExport
) => ({
  organisationId,
  registrationId,
  rowId: `row-${Math.random()}`,
  type: WASTE_RECORD_TYPE.EXPORTED,
  data: {
    processingType: PROCESSING_TYPES.EXPORTER,
    DID_WASTE_PASS_THROUGH_AN_INTERIM_SITE: 'Yes',
    TONNAGE_PASSED_INTERIM_SITE_RECEIVED_BY_OSR: tonnage,
    DATE_OF_EXPORT: dateOfExport
  },
  versions: []
})

const createReprocessorInputWasteRecord = (
  organisationId,
  registrationId,
  tonnage,
  dateReceived
) => ({
  organisationId,
  registrationId,
  rowId: `row-${Math.random()}`,
  type: WASTE_RECORD_TYPE.RECEIVED,
  data: {
    processingType: PROCESSING_TYPES.REPROCESSOR_INPUT,
    TONNAGE_RECEIVED_FOR_RECYCLING: tonnage,
    DATE_RECEIVED_FOR_REPROCESSING: dateReceived
  },
  versions: []
})

const createReprocessorOutputWasteRecord = (
  organisationId,
  registrationId,
  tonnage,
  dateLeftSite
) => ({
  organisationId,
  registrationId,
  rowId: `row-${Math.random()}`,
  type: WASTE_RECORD_TYPE.PROCESSED,
  data: {
    processingType: PROCESSING_TYPES.REPROCESSOR_OUTPUT,
    ADD_PRODUCT_WEIGHT: 'Yes',
    PRODUCT_UK_PACKAGING_WEIGHT_PROPORTION: tonnage,
    DATE_LOAD_LEFT_SITE: dateLeftSite
  },
  versions: []
})

describe('aggregateTonnageByMaterial - Integration', () => {
  const orgId1 = '507f1f77bcf86cd799439011'
  const orgId2 = '507f1f77bcf86cd799439012'
  const regId1 = 'REG-001'
  const regId2 = 'REG-002'
  const regId3 = 'REG-003'

  let db

  beforeEach(async ({ mongoClient }) => {
    db = mongoClient.db(DATABASE_NAME)
    await db.collection(ORGANISATIONS_COLLECTION).deleteMany({})
    await db.collection(WASTE_RECORDS_COLLECTION).deleteMany({})
  })

  it('aggregates exporter tonnage by material with year, month, and type', async () => {
    await db
      .collection(ORGANISATIONS_COLLECTION)
      .insertOne(
        createOrganisation(orgId1, [
          createRegistration(regId1, MATERIAL.PLASTIC)
        ])
      )

    await db
      .collection(WASTE_RECORDS_COLLECTION)
      .insertMany([
        createExporterWasteRecord(orgId1, regId1, 100, '2026-01-15'),
        createExporterWasteRecord(orgId1, regId1, 50, '2026-01-16')
      ])

    const result = await aggregateTonnageByMaterial(db)

    // Verify plastic Exporter has data
    expect(result.materials).toContainEqual({
      material: MATERIAL.PLASTIC,
      year: 2026,
      type: 'Exporter',
      months: [
        { month: 'Jan', tonnage: 150 },
        { month: 'Feb', tonnage: 0 },
        { month: 'Mar', tonnage: 0 }
      ]
    })

    // Verify plastic Reprocessor has zero tonnage (no reprocessor records)
    expect(result.materials).toContainEqual({
      material: MATERIAL.PLASTIC,
      year: 2026,
      type: 'Reprocessor',
      months: [
        { month: 'Jan', tonnage: 0 },
        { month: 'Feb', tonnage: 0 },
        { month: 'Mar', tonnage: 0 }
      ]
    })

    const nonPlasticMaterials = [
      MATERIAL.ALUMINIUM,
      MATERIAL.FIBRE,
      MATERIAL.PAPER,
      MATERIAL.STEEL,
      MATERIAL.WOOD,
      GLASS_RECYCLING_PROCESS.GLASS_RE_MELT,
      GLASS_RECYCLING_PROCESS.GLASS_OTHER
    ]

    nonPlasticMaterials.forEach((material) => {
      expect(result.materials).toContainEqual({
        material,
        year: 2026,
        type: 'Exporter',
        months: [
          { month: 'Jan', tonnage: 0 },
          { month: 'Feb', tonnage: 0 },
          { month: 'Mar', tonnage: 0 }
        ]
      })

      expect(result.materials).toContainEqual({
        material,
        year: 2026,
        type: 'Reprocessor',
        months: [
          { month: 'Jan', tonnage: 0 },
          { month: 'Feb', tonnage: 0 },
          { month: 'Mar', tonnage: 0 }
        ]
      })
    })

    expect(result.total).toBe(150)
  })

  it('aggregates exporter interim site tonnage for glass_re_melt', async () => {
    await db
      .collection(ORGANISATIONS_COLLECTION)
      .insertOne(
        createOrganisation(orgId1, [
          createRegistration(regId1, MATERIAL.GLASS, [
            GLASS_RECYCLING_PROCESS.GLASS_RE_MELT
          ])
        ])
      )

    await db
      .collection(WASTE_RECORDS_COLLECTION)
      .insertMany([
        createExporterInterimSiteWasteRecord(orgId1, regId1, 75, '2026-01-15'),
        createExporterInterimSiteWasteRecord(orgId1, regId1, 25, '2026-01-16')
      ])

    const result = await aggregateTonnageByMaterial(db)

    expect(result.materials).toContainEqual({
      material: GLASS_RECYCLING_PROCESS.GLASS_RE_MELT,
      year: 2026,
      type: 'Exporter',
      months: [
        { month: 'Jan', tonnage: 100 },
        { month: 'Feb', tonnage: 0 },
        { month: 'Mar', tonnage: 0 }
      ]
    })
    expect(result.total).toBe(100)
  })

  it('aggregates exporter tonnage for glass_other', async () => {
    await db
      .collection(ORGANISATIONS_COLLECTION)
      .insertOne(
        createOrganisation(orgId1, [
          createRegistration(regId1, MATERIAL.GLASS, [
            GLASS_RECYCLING_PROCESS.GLASS_OTHER
          ])
        ])
      )

    await db
      .collection(WASTE_RECORDS_COLLECTION)
      .insertMany([
        createExporterWasteRecord(orgId1, regId1, 60, '2026-01-15'),
        createExporterWasteRecord(orgId1, regId1, 40, '2026-01-16')
      ])

    const result = await aggregateTonnageByMaterial(db)

    expect(result.materials).toContainEqual({
      material: GLASS_RECYCLING_PROCESS.GLASS_OTHER,
      year: 2026,
      type: 'Exporter',
      months: [
        { month: 'Jan', tonnage: 100 },
        { month: 'Feb', tonnage: 0 },
        { month: 'Mar', tonnage: 0 }
      ]
    })
    expect(result.total).toBe(100)
  })

  it('aggregates reprocessor-input tonnage for glass_other', async () => {
    await db
      .collection(ORGANISATIONS_COLLECTION)
      .insertOne(
        createOrganisation(orgId1, [
          createRegistration(regId1, MATERIAL.GLASS, [
            GLASS_RECYCLING_PROCESS.GLASS_OTHER
          ])
        ])
      )

    await db
      .collection(WASTE_RECORDS_COLLECTION)
      .insertMany([
        createReprocessorInputWasteRecord(orgId1, regId1, 120, '2026-01-10'),
        createReprocessorInputWasteRecord(orgId1, regId1, 80, '2026-01-11')
      ])

    const result = await aggregateTonnageByMaterial(db)

    expect(result.materials).toContainEqual({
      material: GLASS_RECYCLING_PROCESS.GLASS_OTHER,
      year: 2026,
      type: 'Reprocessor',
      months: [
        { month: 'Jan', tonnage: 200 },
        { month: 'Feb', tonnage: 0 },
        { month: 'Mar', tonnage: 0 }
      ]
    })
    expect(result.total).toBe(200)
  })

  it('aggregates glass_re_melt and glass_other separately', async () => {
    const regId4 = 'REG-004'

    await db
      .collection(ORGANISATIONS_COLLECTION)
      .insertOne(
        createOrganisation(orgId1, [
          createRegistration(regId1, MATERIAL.GLASS, [
            GLASS_RECYCLING_PROCESS.GLASS_RE_MELT
          ]),
          createRegistration(regId4, MATERIAL.GLASS, [
            GLASS_RECYCLING_PROCESS.GLASS_OTHER
          ])
        ])
      )

    await db
      .collection(WASTE_RECORDS_COLLECTION)
      .insertMany([
        createExporterWasteRecord(orgId1, regId1, 100, '2026-01-15'),
        createExporterWasteRecord(orgId1, regId4, 75, '2026-01-15')
      ])

    const result = await aggregateTonnageByMaterial(db)

    expect(result.materials).toContainEqual({
      material: GLASS_RECYCLING_PROCESS.GLASS_RE_MELT,
      year: 2026,
      type: 'Exporter',
      months: [
        { month: 'Jan', tonnage: 100 },
        { month: 'Feb', tonnage: 0 },
        { month: 'Mar', tonnage: 0 }
      ]
    })
    expect(result.materials).toContainEqual({
      material: GLASS_RECYCLING_PROCESS.GLASS_OTHER,
      year: 2026,
      type: 'Exporter',
      months: [
        { month: 'Jan', tonnage: 75 },
        { month: 'Feb', tonnage: 0 },
        { month: 'Mar', tonnage: 0 }
      ]
    })
    expect(result.total).toBe(175)
  })

  it('aggregates reprocessor-input tonnage by material', async () => {
    await db
      .collection(ORGANISATIONS_COLLECTION)
      .insertOne(
        createOrganisation(orgId1, [createRegistration(regId1, MATERIAL.PAPER)])
      )

    await db
      .collection(WASTE_RECORDS_COLLECTION)
      .insertMany([
        createReprocessorInputWasteRecord(orgId1, regId1, 200, '2026-01-10'),
        createReprocessorInputWasteRecord(orgId1, regId1, 300, '2026-01-11')
      ])

    const result = await aggregateTonnageByMaterial(db)

    expect(result.materials).toContainEqual({
      material: MATERIAL.PAPER,
      year: 2026,
      type: 'Reprocessor',
      months: [
        { month: 'Jan', tonnage: 500 },
        { month: 'Feb', tonnage: 0 },
        { month: 'Mar', tonnage: 0 }
      ]
    })
    expect(result.total).toBe(500)
  })

  it('aggregates reprocessor-output tonnage by material', async () => {
    await db
      .collection(ORGANISATIONS_COLLECTION)
      .insertOne(
        createOrganisation(orgId1, [createRegistration(regId1, MATERIAL.STEEL)])
      )

    await db
      .collection(WASTE_RECORDS_COLLECTION)
      .insertMany([
        createReprocessorOutputWasteRecord(orgId1, regId1, 150, '2026-01-20'),
        createReprocessorOutputWasteRecord(orgId1, regId1, 50, '2026-01-21')
      ])

    const result = await aggregateTonnageByMaterial(db)

    expect(result.materials).toContainEqual({
      material: MATERIAL.STEEL,
      year: 2026,
      type: 'Reprocessor',
      months: [
        { month: 'Jan', tonnage: 200 },
        { month: 'Feb', tonnage: 0 },
        { month: 'Mar', tonnage: 0 }
      ]
    })
    expect(result.total).toBe(200)
  })

  it('aggregates tonnage across multiple materials and organisations', async () => {
    await db
      .collection(ORGANISATIONS_COLLECTION)
      .insertMany([
        createOrganisation(orgId1, [
          createRegistration(regId1, MATERIAL.PLASTIC),
          createRegistration(regId2, MATERIAL.GLASS, [
            GLASS_RECYCLING_PROCESS.GLASS_RE_MELT
          ])
        ]),
        createOrganisation(orgId2, [
          createRegistration(regId3, MATERIAL.PLASTIC)
        ])
      ])

    await db
      .collection(WASTE_RECORDS_COLLECTION)
      .insertMany([
        createExporterWasteRecord(orgId1, regId1, 100, '2026-01-15'),
        createExporterWasteRecord(orgId1, regId2, 50, '2026-01-15'),
        createReprocessorInputWasteRecord(orgId2, regId3, 200, '2026-01-15')
      ])

    const result = await aggregateTonnageByMaterial(db)

    expect(result.materials).toContainEqual({
      material: MATERIAL.PLASTIC,
      year: 2026,
      type: 'Exporter',
      months: [
        { month: 'Jan', tonnage: 100 },
        { month: 'Feb', tonnage: 0 },
        { month: 'Mar', tonnage: 0 }
      ]
    })
    expect(result.materials).toContainEqual({
      material: MATERIAL.PLASTIC,
      year: 2026,
      type: 'Reprocessor',
      months: [
        { month: 'Jan', tonnage: 200 },
        { month: 'Feb', tonnage: 0 },
        { month: 'Mar', tonnage: 0 }
      ]
    })
    expect(result.materials).toContainEqual({
      material: GLASS_RECYCLING_PROCESS.GLASS_RE_MELT,
      year: 2026,
      type: 'Exporter',
      months: [
        { month: 'Jan', tonnage: 50 },
        { month: 'Feb', tonnage: 0 },
        { month: 'Mar', tonnage: 0 }
      ]
    })
    expect(result.total).toBe(350)
  })

  it('excludes records without dispatch date', async () => {
    await db
      .collection(ORGANISATIONS_COLLECTION)
      .insertOne(
        createOrganisation(orgId1, [
          createRegistration(regId1, MATERIAL.ALUMINIUM)
        ])
      )

    await db.collection(WASTE_RECORDS_COLLECTION).insertMany([
      createExporterWasteRecord(orgId1, regId1, 100, '2026-01-15'),
      {
        organisationId: orgId1,
        registrationId: regId1,
        rowId: 'row-no-date',
        type: WASTE_RECORD_TYPE.EXPORTED,
        data: {
          processingType: PROCESSING_TYPES.EXPORTER,
          TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: 999
        },
        versions: []
      }
    ])

    const result = await aggregateTonnageByMaterial(db)

    expect(result.materials).toContainEqual({
      material: MATERIAL.ALUMINIUM,
      year: 2026,
      type: 'Exporter',
      months: [
        { month: 'Jan', tonnage: 100 },
        { month: 'Feb', tonnage: 0 },
        { month: 'Mar', tonnage: 0 }
      ]
    })
    expect(result.total).toBe(100)
  })

  it('excludes records with null or unparseable dispatch dates', async () => {
    await db
      .collection(ORGANISATIONS_COLLECTION)
      .insertOne(
        createOrganisation(orgId1, [
          createRegistration(regId1, MATERIAL.PLASTIC)
        ])
      )

    await db.collection(WASTE_RECORDS_COLLECTION).insertMany([
      createExporterWasteRecord(orgId1, regId1, 100, '2026-01-15'),
      createExporterWasteRecord(orgId1, regId1, 999, '09/02/20256'), // invalid year (5 digits)
      createExporterWasteRecord(orgId1, regId1, 999, '2026-99-15'), // invalid month
      createExporterWasteRecord(orgId1, regId1, 999, '2026-01-99'), // invalid day
      createExporterWasteRecord(orgId1, regId1, 999, 'not-a-date'), // not a date string,
      createExporterWasteRecord(orgId1, regId1, 999, null),
      {
        organisationId: orgId1,
        registrationId: regId1,
        rowId: 'row-null-date',
        type: WASTE_RECORD_TYPE.EXPORTED,
        data: {
          processingType: PROCESSING_TYPES.EXPORTER,
          TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: 999
        },
        versions: []
      }
    ])

    const result = await aggregateTonnageByMaterial(db)

    expect(result.materials).toContainEqual({
      material: MATERIAL.PLASTIC,
      year: 2026,
      type: 'Exporter',
      months: [
        { month: 'Jan', tonnage: 100 },
        { month: 'Feb', tonnage: 0 },
        { month: 'Mar', tonnage: 0 }
      ]
    })
    expect(result.total).toBe(100)
  })

  it('excludes records with zero tonnage', async () => {
    await db
      .collection(ORGANISATIONS_COLLECTION)
      .insertOne(
        createOrganisation(orgId1, [createRegistration(regId1, MATERIAL.WOOD)])
      )

    await db
      .collection(WASTE_RECORDS_COLLECTION)
      .insertMany([
        createExporterWasteRecord(orgId1, regId1, 50, '2026-01-15'),
        createExporterWasteRecord(orgId1, regId1, 0, '2026-01-16')
      ])

    const result = await aggregateTonnageByMaterial(db)

    expect(result.materials).toContainEqual({
      material: MATERIAL.WOOD,
      year: 2026,
      type: 'Exporter',
      months: [
        { month: 'Jan', tonnage: 50 },
        { month: 'Feb', tonnage: 0 },
        { month: 'Mar', tonnage: 0 }
      ]
    })
    expect(result.total).toBe(50)
  })

  it('returns zero tonnage rows by material and type when no data exists', async () => {
    const result = await aggregateTonnageByMaterial(db)

    // With pivoted structure: 8 materials × 2 types = 16 entries (each with months array)
    const expectedCount = 8 * 2

    expect(result.materials).toHaveLength(expectedCount)
    expect(result.total).toBe(0)
    // Verify all entries have zero tonnage in all months
    expect(
      result.materials.every((m) =>
        m.months.every((month) => month.tonnage === 0)
      )
    ).toBe(true)
  })

  it('returns generatedAt timestamp', async () => {
    const before = new Date().toISOString()
    const result = await aggregateTonnageByMaterial(db)
    const after = new Date().toISOString()

    expect(result.generatedAt).toBeDefined()
    expect(result.generatedAt >= before).toBe(true)
    expect(result.generatedAt <= after).toBe(true)
  })

  it('excludes reprocessor-output records without ADD_PRODUCT_WEIGHT set to Yes', async () => {
    await db
      .collection(ORGANISATIONS_COLLECTION)
      .insertOne(
        createOrganisation(orgId1, [createRegistration(regId1, MATERIAL.FIBRE)])
      )

    await db.collection(WASTE_RECORDS_COLLECTION).insertMany([
      createReprocessorOutputWasteRecord(orgId1, regId1, 100, '2026-01-20'),
      {
        organisationId: orgId1,
        registrationId: regId1,
        rowId: 'row-no-add',
        type: WASTE_RECORD_TYPE.PROCESSED,
        data: {
          processingType: PROCESSING_TYPES.REPROCESSOR_OUTPUT,
          ADD_PRODUCT_WEIGHT: 'No',
          PRODUCT_UK_PACKAGING_WEIGHT_PROPORTION: 500,
          DATE_LOAD_LEFT_SITE: '2026-01-21'
        },
        versions: []
      }
    ])

    const result = await aggregateTonnageByMaterial(db)

    expect(result.materials).toContainEqual({
      material: MATERIAL.FIBRE,
      year: 2026,
      type: 'Reprocessor',
      months: [
        { month: 'Jan', tonnage: 100 },
        { month: 'Feb', tonnage: 0 },
        { month: 'Mar', tonnage: 0 }
      ]
    })
    expect(result.total).toBe(100)
  })

  it('excludes waste records from test organisations', async () => {
    const testOrgId = '507f1f77bcf86cd799439013'
    const testRegId = 'REG-TEST'

    await db.collection(ORGANISATIONS_COLLECTION).insertMany([
      {
        ...createOrganisation(testOrgId, [
          createRegistration(testRegId, MATERIAL.PLASTIC)
        ]),
        orgId: 999999
      },
      createOrganisation(orgId1, [createRegistration(regId1, MATERIAL.PLASTIC)])
    ])

    await db
      .collection(WASTE_RECORDS_COLLECTION)
      .insertMany([
        createExporterWasteRecord(testOrgId, testRegId, 500, '2026-01-15'),
        createExporterWasteRecord(orgId1, regId1, 100, '2026-01-15')
      ])

    const result = await aggregateTonnageByMaterial(db)

    expect(result.materials).toContainEqual({
      material: MATERIAL.PLASTIC,
      year: 2026,
      type: 'Exporter',
      months: [
        { month: 'Jan', tonnage: 100 },
        { month: 'Feb', tonnage: 0 },
        { month: 'Mar', tonnage: 0 }
      ]
    })
    expect(result.total).toBe(100)
  })
})
