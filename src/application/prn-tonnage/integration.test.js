import { describe, beforeEach, expect, onTestFinished } from 'vitest'
import { ObjectId } from 'mongodb'
import { it, DATABASE_NAME } from '#vite/fixtures/mongo-client.js'
import {
  aggregatePrnTonnage,
  REGISTRATION_TYPE
} from './aggregate-prn-tonnage.js'
import {
  GLASS_RECYCLING_PROCESS,
  MATERIAL,
  REPROCESSING_TYPE,
  TONNAGE_BAND,
  WASTE_PROCESSING_TYPE
} from '#domain/organisations/model.js'
import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'
import {
  buildPrn,
  buildAccreditationSnapshot,
  PRN_YEAR
} from '#packaging-recycling-notes/repository/contract/test-data.js'
import { createMongoLedgerRepository } from '#waste-balances/repository/ledger-mongodb.js'
import {
  createOrganisationReadRepository,
  EXTERNAL_ACCREDITATIONS_COLLECTION_NAME
} from '#organisation-read-model/repository/mongodb.js'
import { buildExternalAccreditation } from '#organisation-read-model/repository/contract/test-data.js'
import { createInMemoryOverseasSitesRepository } from '#overseas-sites/repository/inmemory.plugin.js'
import { toYear } from '#common/helpers/dates/year.js'
import { config } from '#root/config.js'
import { createPackagingRecyclingNotesRepository } from '#packaging-recycling-notes/repository/mongodb.js'
import { createMockLogger } from '#test/mock-logger.js'
import { buildLedgerEvent } from '#waste-balances/repository/ledger-test-data.js'
import {
  toAccreditationNumber,
  toOrganisationNumber,
  toRegistrationNumber
} from '#domain/organisations/numbers.js'

/** @import { PrnStatus } from '#packaging-recycling-notes/domain/model.js' */

const PRNS_COLLECTION = 'packaging-recycling-notes'
const ORGANISATIONS_COLLECTION = 'epr-organisations'

const organisationId = '507f1f77bcf86cd799439011'
const orgId = 100234
const accId = 'acc-1'
const registrationId = 'reg-1'

// Configured as a test organisation in .vite/setup-files.js
const testOrgId = 999999

const approvedStatusHistory = [
  { status: 'approved', updatedAt: new Date('2026-01-01T00:00:00.000Z') }
]

const ledgerId = {
  organisationNumber: toOrganisationNumber(String(orgId)),
  registrationNumber: toRegistrationNumber('REG-1'),
  accreditationNumber: toAccreditationNumber('ACC-1'),
  year: PRN_YEAR
}
const otherLedgerId = {
  ...ledgerId,
  accreditationNumber: toAccreditationNumber('ACC-ANOTHER')
}

/** @param {PrnStatus} currentStatus */
const withStatus = (currentStatus) => ({
  currentStatus,
  currentStatusAt: new Date('2026-02-01T00:00:00.000Z'),
  history: []
})

/**
 * @param {PrnStatus} currentStatus
 * @param {number} tonnage
 */
const prnWithStatus = (currentStatus, tonnage) =>
  buildPrn({
    organisation: {
      organisationNumber: ledgerId.organisationNumber,
      name: 'Acme Reprocessing'
    },
    registration: { registrationNumber: ledgerId.registrationNumber },
    accreditation: buildAccreditationSnapshot({
      accreditationNumber: ledgerId.accreditationNumber,
      material: MATERIAL.PLASTIC
    }),
    tonnage,
    status: withStatus(currentStatus)
  })

const contact = { email: 'contact@example.com', fullName: 'A Contact' }

/**
 * A registration as the database holds one. The organisation schema defaults
 * `registrationNumber` and `reprocessingType` to null until the registration is
 * approved, and forbids an exporter a reprocessing type at all.
 *
 * @typedef {Object} StoredRegistration
 * @property {string} id
 * @property {string | null} registrationNumber
 * @property {string} [accreditationId]
 * @property {string} wasteProcessingType
 * @property {string | null} [reprocessingType]
 * @property {import('#domain/organisations/model.js').AppliedForMaterial} [material]
 * @property {import('#domain/organisations/model.js').GlassRecyclingProcess[]} [glassRecyclingProcess]
 * @property {{ address: { line1: string, town: string, postcode: string } }} [site]
 */

const registrationIdentity = {
  id: registrationId,
  registrationNumber: 'REG-1',
  accreditationId: accId,
  statusHistory: approvedStatusHistory,
  validFrom: '2026-01-01',
  material: MATERIAL.PLASTIC,
  submittedToRegulator: 'ea',
  applicationContactDetails: contact,
  submitterContactDetails: contact,
  approvedPersons: []
}

/**
 * @param {string | null} reprocessingType
 * @returns {StoredRegistration}
 */
const reprocessorRegistration = (reprocessingType) => ({
  ...registrationIdentity,
  wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
  reprocessingType,
  site: {
    address: { line1: '1 Test Street', town: 'Testville', postcode: 'SW1A 1AA' }
  }
})

/** @type {StoredRegistration} */
const exporterRegistration = {
  ...registrationIdentity,
  wasteProcessingType: WASTE_PROCESSING_TYPE.EXPORTER
}

/** @param {StoredRegistration} [registration] */
const organisationWithRegistration = (
  registration = reprocessorRegistration(REPROCESSING_TYPE.INPUT)
) => ({
  _id: new ObjectId(organisationId),
  orgId,
  companyDetails: { name: 'Acme Reprocessing' },
  statusHistory: approvedStatusHistory,
  submittedToRegulator: 'ea',
  submitterContactDetails: contact,
  users: [],
  version: 1,
  accreditations: [
    {
      id: accId,
      accreditationNumber: 'ACC-1',
      material: MATERIAL.PLASTIC,
      prnIssuance: { tonnageBand: TONNAGE_BAND.UP_TO_5000 },
      statusHistory: approvedStatusHistory,
      validFrom: '2026-01-01'
    }
  ],
  registrations: [registration]
})

const expectedRow = (overrides = {}) => ({
  organisationName: 'Acme Reprocessing',
  organisationNumber: String(orgId),
  registrationNumber: 'REG-1',
  registrationType: REGISTRATION_TYPE.REPROCESSOR_INPUT,
  accreditationNumber: 'ACC-1',
  material: MATERIAL.PLASTIC,
  tonnageBand: TONNAGE_BAND.UP_TO_5000,
  wasteBalance: 0,
  availableWasteBalance: 0,
  awaitingAuthorisationTonnage: 0,
  awaitingAcceptanceTonnage: 0,
  awaitingCancellationTonnage: 0,
  acceptedTonnage: 40,
  cancelledTonnage: 0,
  ...overrides
})

describe('aggregatePrnTonnage - Integration', () => {
  /** @type {import('mongodb').Db} */
  let db
  /** @type {import('#waste-balances/repository/ledger-port.js').WasteBalanceLedgerRepository} */
  let ledgerRepository
  /** @type {import('#organisation-read-model/repository/port.js').OrganisationReadRepository} */
  let organisationReadRepository
  /** @type {import('#packaging-recycling-notes/repository/port.js').PackagingRecyclingNotesRepository} */
  let prnRepository

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
      prnRepository = (await createPackagingRecyclingNotesRepository(db, []))(
        createMockLogger()
      )
      await db.collection(PRNS_COLLECTION).deleteMany({})
      await db.collection(ORGANISATIONS_COLLECTION).deleteMany({})
      await db
        .collection(EXTERNAL_ACCREDITATIONS_COLLECTION_NAME)
        .deleteMany({})
      await ledgerRepository.deleteAllInLedger(ledgerId)
      await ledgerRepository.deleteAllInLedger(otherLedgerId)
    }
  )

  it('buckets tonnage by status and resolves tonnage-band from the organisation', async () => {
    await db
      .collection(ORGANISATIONS_COLLECTION)
      .insertOne(organisationWithRegistration())
    await db
      .collection(PRNS_COLLECTION)
      .insertMany([
        prnWithStatus(PRN_STATUS.AWAITING_AUTHORISATION, 10),
        prnWithStatus(PRN_STATUS.AWAITING_ACCEPTANCE, 20),
        prnWithStatus(PRN_STATUS.AWAITING_CANCELLATION, 30),
        prnWithStatus(PRN_STATUS.ACCEPTED, 40),
        prnWithStatus(PRN_STATUS.CANCELLED, 50)
      ])

    const { rows } = await aggregatePrnTonnage(
      prnRepository,
      organisationReadRepository,
      ledgerRepository
    )

    expect(rows).toStrictEqual([
      expectedRow({
        awaitingAuthorisationTonnage: 10,
        awaitingAcceptanceTonnage: 20,
        awaitingCancellationTonnage: 30,
        cancelledTonnage: 50
      })
    ])
  })

  it('excludes deleted and discarded prns', async () => {
    await db
      .collection(PRNS_COLLECTION)
      .insertMany([
        prnWithStatus(PRN_STATUS.DELETED, 100),
        prnWithStatus(PRN_STATUS.DISCARDED, 200)
      ])

    const { rows } = await aggregatePrnTonnage(
      prnRepository,
      organisationReadRepository,
      ledgerRepository
    )

    expect(rows).toStrictEqual([])
  })

  it('refuses to report a row whose organisation it cannot resolve', async () => {
    await db
      .collection(PRNS_COLLECTION)
      .insertOne(prnWithStatus(PRN_STATUS.ACCEPTED, 40))

    await expect(
      aggregatePrnTonnage(
        prnRepository,
        organisationReadRepository,
        ledgerRepository
      )
    ).rejects.toThrow(
      'No organisation in the read model holds accreditation ACC-1 under registration REG-1 of organisation 100234'
    )
  })

  it('refuses to report a row whose accreditation another organisation holds', async () => {
    await db.collection(ORGANISATIONS_COLLECTION).insertOne({
      ...organisationWithRegistration(),
      _id: new ObjectId('507f1f77bcf86cd799439012'),
      orgId: orgId + 1
    })
    await db
      .collection(PRNS_COLLECTION)
      .insertOne(prnWithStatus(PRN_STATUS.ACCEPTED, 40))

    await expect(
      aggregatePrnTonnage(
        prnRepository,
        organisationReadRepository,
        ledgerRepository
      )
    ).rejects.toThrow(
      'No organisation in the read model holds accreditation ACC-1 under registration REG-1 of organisation 100234'
    )
  })

  it('includes prns raised by test organisations', async () => {
    await db
      .collection(ORGANISATIONS_COLLECTION)
      .insertOne({ ...organisationWithRegistration(), orgId: testOrgId })
    await db.collection(PRNS_COLLECTION).insertOne({
      ...prnWithStatus(PRN_STATUS.ACCEPTED, 40),
      organisation: {
        organisationNumber: toOrganisationNumber(String(testOrgId)),
        name: 'Acme Reprocessing'
      }
    })

    const { rows } = await aggregatePrnTonnage(
      prnRepository,
      organisationReadRepository,
      ledgerRepository
    )

    expect(rows).toStrictEqual([
      expectedRow({ organisationNumber: String(testOrgId) })
    ])
  })

  it('sorts rows by organisation name, then accreditation number', async () => {
    const secondOrganisationId = '507f1f77bcf86cd799439012'
    const base = organisationWithRegistration()

    /**
     * @param {string} id
     * @param {number} orgIdNumber
     * @param {string} name
     * @param {Array<[string, string]>} accreditations - [id, number] pairs
     */
    const organisation = (id, orgIdNumber, name, accreditations) => ({
      ...base,
      _id: new ObjectId(id),
      orgId: orgIdNumber,
      companyDetails: { name },
      accreditations: accreditations.map(([accreditationId, number]) => ({
        ...base.accreditations[0],
        id: accreditationId,
        accreditationNumber: number
      })),
      registrations: accreditations.map(([accreditationId]) => ({
        ...base.registrations[0],
        id: `reg-${accreditationId}`,
        registrationNumber: `REG-${accreditationId}`,
        accreditationId
      }))
    })

    /**
     * @param {number} orgIdNumber
     * @param {string} accreditationId
     * @param {string} accreditationNumber
     */
    const prn = (orgIdNumber, accreditationId, accreditationNumber) => ({
      ...prnWithStatus(PRN_STATUS.ACCEPTED, 40),
      organisation: {
        organisationNumber: toOrganisationNumber(String(orgIdNumber)),
        name: 'as raised'
      },
      registration: {
        registrationNumber: toRegistrationNumber(`REG-${accreditationId}`)
      },
      accreditation: buildAccreditationSnapshot({
        accreditationNumber: toAccreditationNumber(accreditationNumber)
      })
    })

    await db.collection(ORGANISATIONS_COLLECTION).insertMany([
      organisation(secondOrganisationId, orgId + 1, 'Zenith Recycling', [
        ['acc-z', 'ACC-0']
      ]),
      organisation(organisationId, orgId, 'Acme Reprocessing', [
        ['acc-b', 'ACC-2'],
        ['acc-a', 'ACC-1']
      ])
    ])
    await db
      .collection(PRNS_COLLECTION)
      .insertMany([
        prn(orgId + 1, 'acc-z', 'ACC-0'),
        prn(orgId, 'acc-b', 'ACC-2'),
        prn(orgId, 'acc-a', 'ACC-1')
      ])

    const { rows } = await aggregatePrnTonnage(
      prnRepository,
      organisationReadRepository,
      ledgerRepository
    )

    expect(
      rows.map((row) => [row.organisationName, row.accreditationNumber])
    ).toStrictEqual([
      ['Acme Reprocessing', 'ACC-1'],
      ['Acme Reprocessing', 'ACC-2'],
      ['Zenith Recycling', 'ACC-0']
    ])
  })

  it('refuses to report a row whose registration the organisation does not hold', async () => {
    await db.collection(ORGANISATIONS_COLLECTION).insertOne({
      ...organisationWithRegistration(),
      registrations: [
        {
          ...reprocessorRegistration(REPROCESSING_TYPE.INPUT),
          registrationNumber: 'REG-OTHER'
        }
      ]
    })
    await db
      .collection(PRNS_COLLECTION)
      .insertOne(prnWithStatus(PRN_STATUS.ACCEPTED, 40))

    await expect(
      aggregatePrnTonnage(
        prnRepository,
        organisationReadRepository,
        ledgerRepository
      )
    ).rejects.toThrow(
      'No organisation in the read model holds accreditation ACC-1 under registration REG-1 of organisation 100234'
    )
  })

  it('refuses to report a reprocessor registration with no reprocessing type', async () => {
    await db
      .collection(ORGANISATIONS_COLLECTION)
      .insertOne(organisationWithRegistration(reprocessorRegistration(null)))
    await db
      .collection(PRNS_COLLECTION)
      .insertOne(prnWithStatus(PRN_STATUS.ACCEPTED, 40))

    await expect(
      aggregatePrnTonnage(
        prnRepository,
        organisationReadRepository,
        ledgerRepository
      )
    ).rejects.toThrow(
      'No organisation in the read model holds accreditation ACC-1 under registration REG-1 of organisation 100234'
    )
  })

  it('refuses to report a row whose accreditation no longer has its number', async () => {
    const organisation = organisationWithRegistration()
    await db.collection(ORGANISATIONS_COLLECTION).insertOne({
      ...organisation,
      accreditations: [
        {
          ...organisation.accreditations[0],
          accreditationNumber: null,
          statusHistory: [
            ...approvedStatusHistory,
            {
              status: 'cancelled',
              updatedAt: new Date('2026-03-01T00:00:00.000Z')
            }
          ]
        }
      ]
    })
    await db
      .collection(PRNS_COLLECTION)
      .insertOne(prnWithStatus(PRN_STATUS.ACCEPTED, 40))

    await expect(
      aggregatePrnTonnage(
        prnRepository,
        organisationReadRepository,
        ledgerRepository
      )
    ).rejects.toThrow(
      'No organisation in the read model holds accreditation ACC-1 under registration REG-1 of organisation 100234'
    )
  })

  it('reports one row per accreditation when its prns snapshot different organisation names', async () => {
    await db
      .collection(ORGANISATIONS_COLLECTION)
      .insertOne(organisationWithRegistration())
    await db.collection(PRNS_COLLECTION).insertMany([
      prnWithStatus(PRN_STATUS.ACCEPTED, 40),
      {
        ...prnWithStatus(PRN_STATUS.ACCEPTED, 10),
        organisation: {
          organisationNumber: ledgerId.organisationNumber,
          name: 'Acme Reprocessing Ltd'
        }
      }
    ])
    await ledgerRepository.appendEvents([
      buildLedgerEvent({
        ...ledgerId,
        closingBalance: { amount: 250, availableAmount: 125 }
      })
    ])

    const { rows } = await aggregatePrnTonnage(
      prnRepository,
      organisationReadRepository,
      ledgerRepository
    )

    expect(rows).toStrictEqual([
      expectedRow({
        acceptedTonnage: 50,
        wasteBalance: 250,
        availableWasteBalance: 125
      })
    ])
  })

  it('reads both balances from the latest ledger event for the accreditation', async () => {
    await db
      .collection(ORGANISATIONS_COLLECTION)
      .insertOne(organisationWithRegistration())
    await db
      .collection(PRNS_COLLECTION)
      .insertOne(prnWithStatus(PRN_STATUS.ACCEPTED, 40))
    await ledgerRepository.appendEvents([
      buildLedgerEvent({
        ...ledgerId,
        number: 1,
        closingBalance: { amount: 500, availableAmount: 400 }
      }),
      buildLedgerEvent({
        ...ledgerId,
        number: 2,
        openingBalance: { amount: 500, availableAmount: 400 },
        closingBalance: { amount: 250, availableAmount: 125 }
      })
    ])

    const { rows } = await aggregatePrnTonnage(
      prnRepository,
      organisationReadRepository,
      ledgerRepository
    )

    expect(rows).toStrictEqual([
      expectedRow({ wasteBalance: 250, availableWasteBalance: 125 })
    ])
  })

  it('ignores ledger events belonging to another accreditation', async () => {
    await db
      .collection(ORGANISATIONS_COLLECTION)
      .insertOne(organisationWithRegistration())
    await db
      .collection(PRNS_COLLECTION)
      .insertOne(prnWithStatus(PRN_STATUS.ACCEPTED, 40))
    await ledgerRepository.appendEvents([
      buildLedgerEvent({
        ...otherLedgerId,
        closingBalance: { amount: 999, availableAmount: 999 }
      })
    ])

    const { rows } = await aggregatePrnTonnage(
      prnRepository,
      organisationReadRepository,
      ledgerRepository
    )

    expect(rows).toStrictEqual([expectedRow()])
  })

  it('reports a reprocessor-output registration as REPROCESSOR_OUTPUT', async () => {
    await db
      .collection(ORGANISATIONS_COLLECTION)
      .insertOne(
        organisationWithRegistration(
          reprocessorRegistration(REPROCESSING_TYPE.OUTPUT)
        )
      )
    await db
      .collection(PRNS_COLLECTION)
      .insertOne(prnWithStatus(PRN_STATUS.ACCEPTED, 40))

    const { rows } = await aggregatePrnTonnage(
      prnRepository,
      organisationReadRepository,
      ledgerRepository
    )

    expect(rows).toStrictEqual([
      expectedRow({ registrationType: REGISTRATION_TYPE.REPROCESSOR_OUTPUT })
    ])
  })

  it('reports an exporter registration as EXPORTER', async () => {
    await db
      .collection(ORGANISATIONS_COLLECTION)
      .insertOne(organisationWithRegistration(exporterRegistration))
    await db
      .collection(PRNS_COLLECTION)
      .insertOne(prnWithStatus(PRN_STATUS.ACCEPTED, 40))

    const { rows } = await aggregatePrnTonnage(
      prnRepository,
      organisationReadRepository,
      ledgerRepository
    )

    expect(rows).toStrictEqual([
      expectedRow({ registrationType: REGISTRATION_TYPE.EXPORTER })
    ])
  })

  it('reports a reprocessor-input registration as REPROCESSOR_INPUT', async () => {
    await db
      .collection(ORGANISATIONS_COLLECTION)
      .insertOne(
        organisationWithRegistration(
          reprocessorRegistration(REPROCESSING_TYPE.INPUT)
        )
      )
    await db
      .collection(PRNS_COLLECTION)
      .insertOne(prnWithStatus(PRN_STATUS.ACCEPTED, 40))

    const { rows } = await aggregatePrnTonnage(
      prnRepository,
      organisationReadRepository,
      ledgerRepository
    )

    expect(rows).toStrictEqual([
      expectedRow({ registrationType: REGISTRATION_TYPE.REPROCESSOR_INPUT })
    ])
  })

  it('reports an accreditation known only by its number', async () => {
    const { accreditationId: _, ...registration } = reprocessorRegistration(
      REPROCESSING_TYPE.INPUT
    )
    await db.collection(ORGANISATIONS_COLLECTION).insertOne({
      ...organisationWithRegistration(registration),
      accreditations: []
    })
    await db.collection(EXTERNAL_ACCREDITATIONS_COLLECTION_NAME).insertOne(
      buildExternalAccreditation({
        registrationNumber: ledgerId.registrationNumber,
        year: ledgerId.year,
        accreditationNumber: ledgerId.accreditationNumber,
        prnIssuance: { tonnageBand: TONNAGE_BAND.UP_TO_5000 },
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
    await db
      .collection(PRNS_COLLECTION)
      .insertOne(prnWithStatus(PRN_STATUS.ACCEPTED, 40))
    await ledgerRepository.appendEvents([
      buildLedgerEvent({
        ...ledgerId,
        closingBalance: { amount: 250, availableAmount: 125 }
      })
    ])

    const { rows } = await aggregatePrnTonnage(
      prnRepository,
      organisationReadRepository,
      ledgerRepository
    )

    expect(rows).toStrictEqual([
      expectedRow({ wasteBalance: 250, availableWasteBalance: 125 })
    ])
  })

  it('reports a stored accreditation beside a later one known only by its number', async () => {
    config.set('openNextYear', true)
    onTestFinished(() => config.reset('openNextYear'))
    const laterLedgerId = {
      ...ledgerId,
      accreditationNumber: toAccreditationNumber('ACC-2027'),
      year: toYear(2027)
    }
    await db
      .collection(ORGANISATIONS_COLLECTION)
      .insertOne(organisationWithRegistration())
    await db.collection(EXTERNAL_ACCREDITATIONS_COLLECTION_NAME).insertOne(
      buildExternalAccreditation({
        registrationNumber: ledgerId.registrationNumber,
        year: laterLedgerId.year,
        accreditationNumber: laterLedgerId.accreditationNumber,
        prnIssuance: { tonnageBand: TONNAGE_BAND.UP_TO_10000 },
        status: {
          current: 'approved',
          timeline: [
            {
              status: 'approved',
              at: '2027-01-01T00:00:00.000Z',
              updatedAt: '2027-01-01T00:00:00.000Z'
            }
          ]
        }
      })
    )
    const laterPrn = prnWithStatus(PRN_STATUS.ACCEPTED, 15)
    await db.collection(PRNS_COLLECTION).insertMany([
      prnWithStatus(PRN_STATUS.ACCEPTED, 40),
      {
        ...laterPrn,
        accreditation: {
          ...laterPrn.accreditation,
          accreditationNumber: laterLedgerId.accreditationNumber,
          accreditationYear: laterLedgerId.year
        }
      }
    ])

    const { rows } = await aggregatePrnTonnage(
      prnRepository,
      organisationReadRepository,
      ledgerRepository
    )

    expect(rows).toStrictEqual([
      expectedRow(),
      expectedRow({
        accreditationNumber: 'ACC-2027',
        tonnageBand: TONNAGE_BAND.UP_TO_10000,
        acceptedTonnage: 15
      })
    ])
  })

  it.each(Object.values(GLASS_RECYCLING_PROCESS))(
    'reports a glass registration by its settled material, %s',
    async (glassRecyclingProcess) => {
      const organisation = organisationWithRegistration({
        ...reprocessorRegistration(REPROCESSING_TYPE.INPUT),
        material: MATERIAL.GLASS,
        glassRecyclingProcess: [glassRecyclingProcess]
      })
      await db.collection(ORGANISATIONS_COLLECTION).insertOne({
        ...organisation,
        accreditations: [
          {
            ...organisation.accreditations[0],
            material: MATERIAL.GLASS,
            glassRecyclingProcess: [glassRecyclingProcess]
          }
        ]
      })
      await db
        .collection(PRNS_COLLECTION)
        .insertOne(prnWithStatus(PRN_STATUS.ACCEPTED, 40))

      const { rows } = await aggregatePrnTonnage(
        prnRepository,
        organisationReadRepository,
        ledgerRepository
      )

      expect(rows).toStrictEqual([
        expectedRow({ material: glassRecyclingProcess })
      ])
    }
  )
})
