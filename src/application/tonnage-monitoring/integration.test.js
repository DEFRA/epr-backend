import { describe, beforeEach, expect } from 'vitest'
import { it as mongoIt } from '#vite/fixtures/mongo.js'
import { MongoClient, ObjectId } from 'mongodb'
import { aggregateTonnageByMaterial } from './aggregate-tonnage.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { MATERIAL } from '#domain/organisations/model.js'

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

const createRegistration = (id, material) => ({
  id,
  material,
  status: 'approved'
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

  it('aggregates exporter tonnage by material', async () => {
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

    expect(result.materials).toContainEqual({
      material: MATERIAL.PLASTIC,
      totalTonnage: 150
    })
    expect(result.total).toBe(150)
  })

  it('aggregates exporter interim site tonnage', async () => {
    await db
      .collection(ORGANISATIONS_COLLECTION)
      .insertOne(
        createOrganisation(orgId1, [createRegistration(regId1, MATERIAL.GLASS)])
      )

    await db
      .collection(WASTE_RECORDS_COLLECTION)
      .insertMany([
        createExporterInterimSiteWasteRecord(orgId1, regId1, 75, '2026-01-15'),
        createExporterInterimSiteWasteRecord(orgId1, regId1, 25, '2026-01-16')
      ])

    const result = await aggregateTonnageByMaterial(db)

    expect(result.materials).toContainEqual({
      material: MATERIAL.GLASS,
      totalTonnage: 100
    })
    expect(result.total).toBe(100)
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
      totalTonnage: 500
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
      totalTonnage: 200
    })
    expect(result.total).toBe(200)
  })

  it('aggregates tonnage across multiple materials and organisations', async () => {
    await db
      .collection(ORGANISATIONS_COLLECTION)
      .insertMany([
        createOrganisation(orgId1, [
          createRegistration(regId1, MATERIAL.PLASTIC),
          createRegistration(regId2, MATERIAL.GLASS)
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
      totalTonnage: 300
    })
    expect(result.materials).toContainEqual({
      material: MATERIAL.GLASS,
      totalTonnage: 50
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
      totalTonnage: 100
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
      totalTonnage: 50
    })
    expect(result.total).toBe(50)
  })

  it('returns all materials with zero tonnage when no data exists', async () => {
    const result = await aggregateTonnageByMaterial(db)

    expect(result.materials).toHaveLength(Object.values(MATERIAL).length)
    Object.values(MATERIAL).forEach((material) => {
      expect(result.materials).toContainEqual({ material, totalTonnage: 0 })
    })
    expect(result.total).toBe(0)
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
      totalTonnage: 100
    })
    expect(result.total).toBe(100)
  })
})
