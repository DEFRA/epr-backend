import { describe, beforeEach, afterEach, expect, vi } from 'vitest'
import { ObjectId } from 'mongodb'
import { it, DATABASE_NAME } from '#vite/fixtures/mongo-client.js'
import { aggregateTonnageByMaterial } from './aggregate-tonnage.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import {
  MATERIAL,
  GLASS_RECYCLING_PROCESS
} from '#domain/organisations/model.js'
import { SUMMARY_LOG_ROW_STATES_COLLECTION_NAME } from '#waste-records/repository/mongodb.js'
import {
  WASTE_BALANCE_EVENTS_COLLECTION_NAME,
  createMongoLedgerRepository
} from '#waste-balances/repository/ledger-mongodb.js'
import { LEDGER_EVENT_KIND } from '#waste-balances/repository/ledger-schema.js'
import { WASTE_BALANCE_OUTCOME } from '#waste-balances/domain/waste-balance-classification.js'

const ORGANISATIONS_COLLECTION = 'epr-organisations'

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

const latestSubmittedSummaryLogIdFor = (registrationId) =>
  `sl-${registrationId}`

const createRowState = ({
  organisationId,
  registrationId,
  accreditationId = null,
  wasteRecordType,
  processingType,
  data,
  summaryLogId
}) => ({
  organisationId,
  registrationId,
  accreditationId,
  wasteRecordType,
  rowId: `row-${Math.random()}`,
  processingType,
  data,
  classification: {
    outcome: WASTE_BALANCE_OUTCOME.INCLUDED,
    reasons: [],
    transactionAmount: 0
  },
  summaryLogIds: [summaryLogId]
})

const createExporterRowState = (
  organisationId,
  registrationId,
  tonnage,
  dateOfExport,
  summaryLogId = latestSubmittedSummaryLogIdFor(registrationId)
) =>
  createRowState({
    organisationId,
    registrationId,
    summaryLogId,
    wasteRecordType: WASTE_RECORD_TYPE.EXPORTED,
    processingType: PROCESSING_TYPES.EXPORTER,
    data: {
      TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: tonnage,
      DATE_OF_EXPORT: dateOfExport
    }
  })

const createExporterInterimSiteRowState = (
  organisationId,
  registrationId,
  tonnage,
  dateOfExport,
  summaryLogId = latestSubmittedSummaryLogIdFor(registrationId)
) =>
  createRowState({
    organisationId,
    registrationId,
    summaryLogId,
    wasteRecordType: WASTE_RECORD_TYPE.EXPORTED,
    processingType: PROCESSING_TYPES.EXPORTER,
    data: {
      DID_WASTE_PASS_THROUGH_AN_INTERIM_SITE: 'Yes',
      TONNAGE_PASSED_INTERIM_SITE_RECEIVED_BY_OSR: tonnage,
      DATE_OF_EXPORT: dateOfExport
    }
  })

const createReprocessorInputRowState = (
  organisationId,
  registrationId,
  tonnage,
  dateReceived,
  summaryLogId = latestSubmittedSummaryLogIdFor(registrationId)
) =>
  createRowState({
    organisationId,
    registrationId,
    summaryLogId,
    wasteRecordType: WASTE_RECORD_TYPE.RECEIVED,
    processingType: PROCESSING_TYPES.REPROCESSOR_INPUT,
    data: {
      TONNAGE_RECEIVED_FOR_RECYCLING: tonnage,
      DATE_RECEIVED_FOR_REPROCESSING: dateReceived
    }
  })

const createReprocessorOutputRowState = (
  organisationId,
  registrationId,
  tonnage,
  dateLeftSite,
  summaryLogId = latestSubmittedSummaryLogIdFor(registrationId)
) =>
  createRowState({
    organisationId,
    registrationId,
    summaryLogId,
    wasteRecordType: WASTE_RECORD_TYPE.PROCESSED,
    processingType: PROCESSING_TYPES.REPROCESSOR_OUTPUT,
    data: {
      ADD_PRODUCT_WEIGHT: 'Yes',
      PRODUCT_UK_PACKAGING_WEIGHT_PROPORTION: tonnage,
      DATE_LOAD_LEFT_SITE: dateLeftSite
    }
  })

const submittedSummaryLogEvent = ({
  organisationId,
  registrationId,
  accreditationId,
  summaryLogId,
  number
}) => ({
  organisationId,
  registrationId,
  accreditationId,
  number,
  kind: LEDGER_EVENT_KIND.SUMMARY_LOG_SUBMITTED,
  payload: { summaryLogId, creditTotal: 0 }
})

describe('aggregateTonnageByMaterial - Integration', () => {
  const orgId1 = '507f1f77bcf86cd799439011'
  const orgId2 = '507f1f77bcf86cd799439012'
  const regId1 = 'REG-001'
  const regId2 = 'REG-002'
  const regId3 = 'REG-003'

  let db
  let ledgerRepository

  /**
   * Insert row states and record one submitted summary log per distinct ledger
   * partition, so every row's `summaryLogIds[0]` is the latest submitted summary
   * log of its `(registrationId, accreditationId)` ledger.
   */
  const submitRows = async (rows) => {
    await db.collection(SUMMARY_LOG_ROW_STATES_COLLECTION_NAME).insertMany(rows)

    const submissions = new Map()
    for (const row of rows) {
      submissions.set(`${row.registrationId}::${row.accreditationId}`, {
        organisationId: row.organisationId,
        registrationId: row.registrationId,
        accreditationId: row.accreditationId,
        summaryLogId: row.summaryLogIds[0]
      })
    }

    await db
      .collection(WASTE_BALANCE_EVENTS_COLLECTION_NAME)
      .insertMany(
        [...submissions.values()].map((submission) =>
          submittedSummaryLogEvent({ ...submission, number: 1 })
        )
      )
  }

  beforeEach(
    async (
      /** @type {{ mongoClient: import('mongodb').MongoClient }} */ {
        mongoClient
      }
    ) => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-03-15T10:00:00.000Z'))
      db = mongoClient.db(DATABASE_NAME)
      await db.collection(ORGANISATIONS_COLLECTION).deleteMany({})
      await db.collection(SUMMARY_LOG_ROW_STATES_COLLECTION_NAME).deleteMany({})
      await db.collection(WASTE_BALANCE_EVENTS_COLLECTION_NAME).deleteMany({})
      ledgerRepository = (await createMongoLedgerRepository(db))()
    }
  )

  afterEach(() => {
    vi.useRealTimers()
  })

  it('aggregates exporter tonnage by material with year, month, and type', async () => {
    await db
      .collection(ORGANISATIONS_COLLECTION)
      .insertOne(
        createOrganisation(orgId1, [
          createRegistration(regId1, MATERIAL.PLASTIC)
        ])
      )

    await submitRows([
      createExporterRowState(orgId1, regId1, 100, '2026-01-15'),
      createExporterRowState(orgId1, regId1, 50, '2026-01-16')
    ])

    const result = await aggregateTonnageByMaterial(db, ledgerRepository)

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

    await submitRows([
      createExporterInterimSiteRowState(orgId1, regId1, 75, '2026-01-15'),
      createExporterInterimSiteRowState(orgId1, regId1, 25, '2026-01-16')
    ])

    const result = await aggregateTonnageByMaterial(db, ledgerRepository)

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

    await submitRows([
      createExporterRowState(orgId1, regId1, 60, '2026-01-15'),
      createExporterRowState(orgId1, regId1, 40, '2026-01-16')
    ])

    const result = await aggregateTonnageByMaterial(db, ledgerRepository)

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

    await submitRows([
      createReprocessorInputRowState(orgId1, regId1, 120, '2026-01-10'),
      createReprocessorInputRowState(orgId1, regId1, 80, '2026-01-11')
    ])

    const result = await aggregateTonnageByMaterial(db, ledgerRepository)

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

    await submitRows([
      createExporterRowState(orgId1, regId1, 100, '2026-01-15'),
      createExporterRowState(orgId1, regId4, 75, '2026-01-15')
    ])

    const result = await aggregateTonnageByMaterial(db, ledgerRepository)

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

    await submitRows([
      createReprocessorInputRowState(orgId1, regId1, 200, '2026-01-10'),
      createReprocessorInputRowState(orgId1, regId1, 300, '2026-01-11')
    ])

    const result = await aggregateTonnageByMaterial(db, ledgerRepository)

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

    await submitRows([
      createReprocessorOutputRowState(orgId1, regId1, 150, '2026-01-20'),
      createReprocessorOutputRowState(orgId1, regId1, 50, '2026-01-21')
    ])

    const result = await aggregateTonnageByMaterial(db, ledgerRepository)

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

    await submitRows([
      createExporterRowState(orgId1, regId1, 100, '2026-01-15'),
      createExporterRowState(orgId1, regId2, 50, '2026-01-15'),
      createReprocessorInputRowState(orgId2, regId3, 200, '2026-01-15')
    ])

    const result = await aggregateTonnageByMaterial(db, ledgerRepository)

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

  it('includes only the row states from the latest submitted summary log, excluding superseded states', async () => {
    await db
      .collection(ORGANISATIONS_COLLECTION)
      .insertOne(
        createOrganisation(orgId1, [
          createRegistration(regId1, MATERIAL.PLASTIC)
        ])
      )

    // An earlier submission carried a 100t row; a later submission re-stated it
    // as 250t. The changed content lives in a distinct state document whose
    // membership carries only its own submission, so the two never merge.
    await db
      .collection(SUMMARY_LOG_ROW_STATES_COLLECTION_NAME)
      .insertMany([
        createExporterRowState(orgId1, regId1, 100, '2026-01-15', 'sl-old'),
        createExporterRowState(orgId1, regId1, 250, '2026-01-15', 'sl-new')
      ])

    await db.collection(WASTE_BALANCE_EVENTS_COLLECTION_NAME).insertMany([
      submittedSummaryLogEvent({
        organisationId: orgId1,
        registrationId: regId1,
        accreditationId: null,
        summaryLogId: 'sl-old',
        number: 1
      }),
      submittedSummaryLogEvent({
        organisationId: orgId1,
        registrationId: regId1,
        accreditationId: null,
        summaryLogId: 'sl-new',
        number: 2
      })
    ])

    const result = await aggregateTonnageByMaterial(db, ledgerRepository)

    expect(result.materials).toContainEqual({
      material: MATERIAL.PLASTIC,
      year: 2026,
      type: 'Exporter',
      months: [
        { month: 'Jan', tonnage: 250 },
        { month: 'Feb', tonnage: 0 },
        { month: 'Mar', tonnage: 0 }
      ]
    })
    expect(result.total).toBe(250)
  })

  it('excludes row states whose registration has no submitted summary log', async () => {
    await db
      .collection(ORGANISATIONS_COLLECTION)
      .insertOne(
        createOrganisation(orgId1, [
          createRegistration(regId1, MATERIAL.PLASTIC)
        ])
      )

    await db
      .collection(SUMMARY_LOG_ROW_STATES_COLLECTION_NAME)
      .insertOne(createExporterRowState(orgId1, regId1, 100, '2026-01-15'))

    const result = await aggregateTonnageByMaterial(db, ledgerRepository)

    expect(result.total).toBe(0)
  })

  it('resolves the latest submitted summary log even when later ledger events exist', async () => {
    await db
      .collection(ORGANISATIONS_COLLECTION)
      .insertOne(
        createOrganisation(orgId1, [
          createRegistration(regId1, MATERIAL.PLASTIC)
        ])
      )

    await db
      .collection(SUMMARY_LOG_ROW_STATES_COLLECTION_NAME)
      .insertOne(createExporterRowState(orgId1, regId1, 100, '2026-01-15'))

    await db.collection(WASTE_BALANCE_EVENTS_COLLECTION_NAME).insertMany([
      submittedSummaryLogEvent({
        organisationId: orgId1,
        registrationId: regId1,
        accreditationId: null,
        summaryLogId: latestSubmittedSummaryLogIdFor(regId1),
        number: 1
      }),
      {
        organisationId: orgId1,
        registrationId: regId1,
        accreditationId: null,
        number: 2,
        kind: LEDGER_EVENT_KIND.PRN_ISSUED,
        payload: { prnId: 'PRN-1', amount: 10 }
      }
    ])

    const result = await aggregateTonnageByMaterial(db, ledgerRepository)

    expect(result.total).toBe(100)
  })

  it('resolves the latest submitted summary log independently for a registered-only and an accredited ledger', async () => {
    await db
      .collection(ORGANISATIONS_COLLECTION)
      .insertMany([
        createOrganisation(orgId1, [
          createRegistration(regId1, MATERIAL.PLASTIC)
        ]),
        createOrganisation(orgId2, [
          createRegistration(regId2, MATERIAL.PLASTIC)
        ])
      ])

    const registeredOnlyRow = createExporterRowState(
      orgId1,
      regId1,
      100,
      '2026-01-15',
      'sl-registered-only'
    )
    const accreditedRow = {
      ...createExporterRowState(
        orgId2,
        regId2,
        30,
        '2026-01-15',
        'sl-accredited'
      ),
      accreditationId: 'ACC-1'
    }

    await db
      .collection(SUMMARY_LOG_ROW_STATES_COLLECTION_NAME)
      .insertMany([registeredOnlyRow, accreditedRow])

    await db.collection(WASTE_BALANCE_EVENTS_COLLECTION_NAME).insertMany([
      submittedSummaryLogEvent({
        organisationId: orgId1,
        registrationId: regId1,
        accreditationId: null,
        summaryLogId: 'sl-registered-only',
        number: 1
      }),
      submittedSummaryLogEvent({
        organisationId: orgId2,
        registrationId: regId2,
        accreditationId: 'ACC-1',
        summaryLogId: 'sl-accredited',
        number: 1
      })
    ])

    const result = await aggregateTonnageByMaterial(db, ledgerRepository)

    expect(result.total).toBe(130)
  })

  it('excludes records without dispatch date', async () => {
    await db
      .collection(ORGANISATIONS_COLLECTION)
      .insertOne(
        createOrganisation(orgId1, [
          createRegistration(regId1, MATERIAL.ALUMINIUM)
        ])
      )

    await submitRows([
      createExporterRowState(orgId1, regId1, 100, '2026-01-15'),
      createRowState({
        organisationId: orgId1,
        registrationId: regId1,
        summaryLogId: latestSubmittedSummaryLogIdFor(regId1),
        wasteRecordType: WASTE_RECORD_TYPE.EXPORTED,
        processingType: PROCESSING_TYPES.EXPORTER,
        data: {
          TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: 999
        }
      })
    ])

    const result = await aggregateTonnageByMaterial(db, ledgerRepository)

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

    await submitRows([
      createExporterRowState(orgId1, regId1, 100, '2026-01-15'),
      createExporterRowState(orgId1, regId1, 999, '09/02/20256'), // invalid year (5 digits)
      createExporterRowState(orgId1, regId1, 999, '2026-99-15'), // invalid month
      createExporterRowState(orgId1, regId1, 999, '2026-01-99'), // invalid day
      createExporterRowState(orgId1, regId1, 999, 'not-a-date'), // not a date string,
      createExporterRowState(orgId1, regId1, 999, null),
      createRowState({
        organisationId: orgId1,
        registrationId: regId1,
        summaryLogId: latestSubmittedSummaryLogIdFor(regId1),
        wasteRecordType: WASTE_RECORD_TYPE.EXPORTED,
        processingType: PROCESSING_TYPES.EXPORTER,
        data: {
          TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: 999
        }
      })
    ])

    const result = await aggregateTonnageByMaterial(db, ledgerRepository)

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

    await submitRows([
      createExporterRowState(orgId1, regId1, 50, '2026-01-15'),
      createExporterRowState(orgId1, regId1, 0, '2026-01-16')
    ])

    const result = await aggregateTonnageByMaterial(db, ledgerRepository)

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
    const result = await aggregateTonnageByMaterial(db, ledgerRepository)

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
    const result = await aggregateTonnageByMaterial(db, ledgerRepository)
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

    await submitRows([
      createReprocessorOutputRowState(orgId1, regId1, 100, '2026-01-20'),
      createRowState({
        organisationId: orgId1,
        registrationId: regId1,
        summaryLogId: latestSubmittedSummaryLogIdFor(regId1),
        wasteRecordType: WASTE_RECORD_TYPE.PROCESSED,
        processingType: PROCESSING_TYPES.REPROCESSOR_OUTPUT,
        data: {
          ADD_PRODUCT_WEIGHT: 'No',
          PRODUCT_UK_PACKAGING_WEIGHT_PROPORTION: 500,
          DATE_LOAD_LEFT_SITE: '2026-01-21'
        }
      })
    ])

    const result = await aggregateTonnageByMaterial(db, ledgerRepository)

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

    await submitRows([
      createExporterRowState(testOrgId, testRegId, 500, '2026-01-15'),
      createExporterRowState(orgId1, regId1, 100, '2026-01-15')
    ])

    const result = await aggregateTonnageByMaterial(db, ledgerRepository)

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
