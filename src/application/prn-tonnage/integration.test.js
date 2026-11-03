import { describe, beforeEach, expect } from 'vitest'
import { ObjectId } from 'mongodb'
import { it, DATABASE_NAME } from '#vite/fixtures/mongo-client.js'
import {
  aggregatePrnTonnage,
  REGISTRATION_TYPE
} from './aggregate-prn-tonnage.js'
import {
  MATERIAL,
  REPROCESSING_TYPE,
  TONNAGE_BAND
} from '#domain/organisations/model.js'
import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'
import {
  buildPrn,
  buildAccreditationSnapshot
} from '#packaging-recycling-notes/repository/contract/test-data.js'
import { createMongoLedgerRepository } from '#waste-balances/repository/ledger-mongodb.js'
import { createOrganisationsRepository } from '#repositories/organisations/mongodb.js'
import { createOverseasSitesRepository } from '#overseas-sites/repository/mongodb.js'
import { createOrganisationReadRepository } from '#organisation-read-model/repository/adapter.js'
import { createPackagingRecyclingNotesRepository } from '#packaging-recycling-notes/repository/mongodb.js'
import { createOrganisationBuilders } from '#repositories/organisations/contract/test-data.js'
import {
  ACCREDITATION_NUMBER,
  REPROCESSOR_NUMBER,
  accreditation,
  exporter,
  reprocessor
} from '#organisation-read-model/repository/contract/organisation-read-test-helpers.js'
import {
  toOrganisationNumber,
  toRegistrationNumber
} from '#domain/organisations/numbers.js'
import { createMockLogger } from '#test/mock-logger.js'
import { buildLedgerEvent } from '#waste-balances/repository/ledger-test-data.js'

/** @import { PrnStatus } from '#packaging-recycling-notes/domain/model.js' */

const PRNS_COLLECTION = 'packaging-recycling-notes'
const ORGANISATIONS_COLLECTION = 'epr-organisations'

const organisationId = '507f1f77bcf86cd799439011'
const orgId = 100234
const accId = 'acc-1'
const registrationId = 'reg-1'

// Configured as a test organisation in .vite/setup-files.js
const testOrgId = 999999

const { buildOrganisation } = createOrganisationBuilders()

const ledgerId = {
  organisationId,
  registrationId,
  accreditationId: accId
}
const otherLedgerId = { ...ledgerId, accreditationId: 'another-accreditation' }

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
    registrationId,
    organisation: {
      id: organisationId,
      name: 'Acme Reprocessing',
      organisationNumber: toOrganisationNumber(String(orgId))
    },
    registration: {
      registrationNumber: toRegistrationNumber(REPROCESSOR_NUMBER)
    },
    accreditation: buildAccreditationSnapshot({
      id: accId,
      accreditationNumber: ACCREDITATION_NUMBER,
      material: MATERIAL.PLASTIC
    }),
    tonnage,
    status: withStatus(currentStatus)
  })

/**
 * The registration the accreditation belongs to, as the database holds one.
 *
 * @param {string | null} reprocessingType
 */
const reprocessorRegistration = (reprocessingType) =>
  reprocessor({
    id: registrationId,
    material: MATERIAL.PLASTIC,
    accreditationId: accId,
    reprocessingType
  })

const exporterRegistration = exporter({
  id: registrationId,
  material: MATERIAL.PLASTIC,
  accreditationId: accId,
  registrationNumber: REPROCESSOR_NUMBER,
  overseasSites: {}
})

const storedAccreditation = () =>
  accreditation({
    id: accId,
    material: MATERIAL.PLASTIC,
    prnIssuance: { tonnageBand: TONNAGE_BAND.UP_TO_5000 }
  })

/**
 * @param {Record<string, any>} [registration]
 * @param {Record<string, any>} [overrides]
 */
const organisationWithRegistration = (
  registration = reprocessorRegistration(REPROCESSING_TYPE.INPUT),
  overrides = {}
) => {
  const { id, ...rest } = buildOrganisation({
    id: organisationId,
    orgId,
    companyDetails: { name: 'Acme Reprocessing' },
    registrations: [registration],
    accreditations: [storedAccreditation()],
    ...overrides
  })
  return { _id: new ObjectId(id), ...rest }
}

const expectedRow = (overrides = {}) => ({
  organisationName: 'Acme Reprocessing',
  orgId: String(orgId),
  registrationNumber: REPROCESSOR_NUMBER,
  registrationType: REGISTRATION_TYPE.REPROCESSOR_INPUT,
  accreditationNumber: ACCREDITATION_NUMBER,
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
      organisationReadRepository = createOrganisationReadRepository({
        organisationsRepository: (await createOrganisationsRepository(db))(),
        overseasSitesRepository: (await createOverseasSitesRepository(db))(),
        logger: createMockLogger()
      })
      prnRepository = (await createPackagingRecyclingNotesRepository(db, []))(
        createMockLogger()
      )
      await db.collection(PRNS_COLLECTION).deleteMany({})
      await db.collection(ORGANISATIONS_COLLECTION).deleteMany({})
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
    ).rejects.toThrow('Unreportable PRN tonnage row for accreditation acc-1')
  })

  it('refuses to report a row whose accreditation another organisation holds', async () => {
    await db
      .collection(ORGANISATIONS_COLLECTION)
      .insertOne(organisationWithRegistration(undefined, { orgId: orgId + 1 }))
    await db
      .collection(PRNS_COLLECTION)
      .insertOne(prnWithStatus(PRN_STATUS.ACCEPTED, 40))

    await expect(
      aggregatePrnTonnage(
        prnRepository,
        organisationReadRepository,
        ledgerRepository
      )
    ).rejects.toThrow('Unreportable PRN tonnage row for accreditation acc-1')
  })

  it('includes prns raised by test organisations', async () => {
    await db
      .collection(ORGANISATIONS_COLLECTION)
      .insertOne(organisationWithRegistration(undefined, { orgId: testOrgId }))
    await db.collection(PRNS_COLLECTION).insertOne({
      ...prnWithStatus(PRN_STATUS.ACCEPTED, 40),
      organisation: {
        id: organisationId,
        name: 'Acme Reprocessing',
        organisationNumber: toOrganisationNumber(String(testOrgId))
      }
    })

    const { rows } = await aggregatePrnTonnage(
      prnRepository,
      organisationReadRepository,
      ledgerRepository
    )

    expect(rows).toStrictEqual([expectedRow({ orgId: String(testOrgId) })])
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
        ...storedAccreditation(),
        id: accreditationId,
        accreditationNumber: number
      })),
      registrations: accreditations.map(([accreditationId, number]) => ({
        ...reprocessorRegistration(REPROCESSING_TYPE.INPUT),
        id: `reg-${accreditationId}`,
        registrationNumber: `REG-${number}`,
        accreditationId
      }))
    })

    /**
     * @param {string} id
     * @param {number} orgIdNumber
     * @param {string} accreditationId
     * @param {string} number
     */
    const prn = (id, orgIdNumber, accreditationId, number) => ({
      ...prnWithStatus(PRN_STATUS.ACCEPTED, 40),
      registrationId: `reg-${accreditationId}`,
      organisation: {
        id,
        name: 'as raised',
        organisationNumber: toOrganisationNumber(String(orgIdNumber))
      },
      registration: {
        registrationNumber: toRegistrationNumber(`REG-${number}`)
      },
      accreditation: buildAccreditationSnapshot({
        id: accreditationId,
        accreditationNumber: number
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
        prn(secondOrganisationId, orgId + 1, 'acc-z', 'ACC-0'),
        prn(organisationId, orgId, 'acc-b', 'ACC-2'),
        prn(organisationId, orgId, 'acc-a', 'ACC-1')
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
          registrationNumber: 'R26ER5001180099PL'
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
    ).rejects.toThrow('Unreportable PRN tonnage row for accreditation acc-1')
  })

  it.each([
    [
      'a reprocessor registration with no reprocessing type',
      () => reprocessorRegistration(null)
    ],
    [
      'a registration with no registration number',
      () => ({
        ...reprocessorRegistration(REPROCESSING_TYPE.INPUT),
        registrationNumber: null
      })
    ]
  ])(
    'refuses to report a row whose registration the read model drops: %s',
    async (_, registration) => {
      await db
        .collection(ORGANISATIONS_COLLECTION)
        .insertOne(organisationWithRegistration(registration()))
      await db
        .collection(PRNS_COLLECTION)
        .insertOne(prnWithStatus(PRN_STATUS.ACCEPTED, 40))

      await expect(
        aggregatePrnTonnage(
          prnRepository,
          organisationReadRepository,
          ledgerRepository
        )
      ).rejects.toThrow('Unreportable PRN tonnage row for accreditation acc-1')
    }
  )

  it('refuses to report a row whose accreditation the read model drops', async () => {
    await db.collection(ORGANISATIONS_COLLECTION).insertOne(
      organisationWithRegistration(undefined, {
        accreditations: [
          { ...storedAccreditation(), accreditationNumber: null }
        ]
      })
    )
    await db
      .collection(PRNS_COLLECTION)
      .insertOne(prnWithStatus(PRN_STATUS.ACCEPTED, 40))

    await expect(
      aggregatePrnTonnage(
        prnRepository,
        organisationReadRepository,
        ledgerRepository
      )
    ).rejects.toThrow('Unreportable PRN tonnage row for accreditation acc-1')
  })

  it('refuses to report PRNs stored without their numbers', async () => {
    await db
      .collection(ORGANISATIONS_COLLECTION)
      .insertOne(organisationWithRegistration())
    await db.collection(PRNS_COLLECTION).insertOne({
      ...prnWithStatus(PRN_STATUS.ACCEPTED, 40),
      organisation: { id: organisationId, name: 'Acme Reprocessing' },
      registration: undefined
    })

    await expect(
      aggregatePrnTonnage(
        prnRepository,
        organisationReadRepository,
        ledgerRepository
      )
    ).rejects.toThrow(
      'Cannot use PRNs of accreditation acc-1 without its numbers: organisationNumber, registrationNumber'
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
          id: organisationId,
          name: 'Acme Reprocessing Ltd',
          organisationNumber: toOrganisationNumber(String(orgId))
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

  it('reports a glass registration as glass, whichever recycling process it holds', async () => {
    await db.collection(ORGANISATIONS_COLLECTION).insertOne(
      organisationWithRegistration(
        {
          ...reprocessorRegistration(REPROCESSING_TYPE.INPUT),
          material: MATERIAL.GLASS,
          glassRecyclingProcess: ['glass_re_melt']
        },
        {
          accreditations: [
            {
              ...storedAccreditation(),
              material: MATERIAL.GLASS,
              glassRecyclingProcess: ['glass_re_melt']
            }
          ]
        }
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

    expect(rows).toStrictEqual([expectedRow({ material: MATERIAL.GLASS })])
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
})
