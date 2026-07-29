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
  TONNAGE_BAND,
  WASTE_PROCESSING_TYPE
} from '#domain/organisations/model.js'
import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'
import {
  buildPrn,
  buildAccreditation
} from '#packaging-recycling-notes/repository/contract/test-data.js'
import { createMongoLedgerRepository } from '#waste-balances/repository/ledger-mongodb.js'
import { buildLedgerEvent } from '#waste-balances/repository/ledger-test-data.js'

/** @import { PrnStatus } from '#packaging-recycling-notes/domain/model.js' */

const PRNS_COLLECTION = 'packaging-recycling-notes'
const ORGANISATIONS_COLLECTION = 'epr-organisations'

const organisationId = '507f1f77bcf86cd799439011'
const orgId = 100234
const accId = 'acc-1'
const registrationId = 'reg-1'

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
    organisation: { id: organisationId, name: 'Acme Reprocessing' },
    accreditation: buildAccreditation({
      id: accId,
      accreditationNumber: 'ACC-1',
      material: MATERIAL.PLASTIC
    }),
    tonnage,
    status: withStatus(currentStatus)
  })

/**
 * A registration as the database holds one. The organisation schema defaults
 * `registrationNumber` and `reprocessingType` to null until the registration is
 * approved, and forbids an exporter a reprocessing type at all.
 *
 * @typedef {Object} StoredRegistration
 * @property {string} id
 * @property {string | null} registrationNumber
 * @property {string} accreditationId
 * @property {string} wasteProcessingType
 * @property {string | null} [reprocessingType]
 */

const registrationIdentity = {
  id: registrationId,
  registrationNumber: 'REG-1',
  accreditationId: accId
}

/**
 * @param {string | null} reprocessingType
 * @returns {StoredRegistration}
 */
const reprocessorRegistration = (reprocessingType) => ({
  ...registrationIdentity,
  wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
  reprocessingType
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
  accreditations: [
    { id: accId, prnIssuance: { tonnageBand: TONNAGE_BAND.UP_TO_5000 } }
  ],
  registrations: [registration]
})

const expectedRow = (overrides = {}) => ({
  organisationName: 'Acme Reprocessing',
  orgId: String(orgId),
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

  beforeEach(
    async (
      /** @type {{ mongoClient: import('mongodb').MongoClient }} */ {
        mongoClient
      }
    ) => {
      db = mongoClient.db(DATABASE_NAME)
      ledgerRepository = (await createMongoLedgerRepository(db))()
      await db.collection(PRNS_COLLECTION).deleteMany({})
      await db.collection(ORGANISATIONS_COLLECTION).deleteMany({})
      await ledgerRepository.deleteAllInLedger(ledgerId)
      await ledgerRepository.deleteAllInLedger(otherLedgerId)
    }
  )

  it('buckets tonnage by status and resolves tonnage-band from the org lookup', async () => {
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

    const { rows } = await aggregatePrnTonnage(db, ledgerRepository)

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

    const { rows } = await aggregatePrnTonnage(db, ledgerRepository)

    expect(rows).toStrictEqual([])
  })

  it('refuses to report a row whose organisation it cannot resolve', async () => {
    await db
      .collection(PRNS_COLLECTION)
      .insertOne(prnWithStatus(PRN_STATUS.ACCEPTED, 40))

    await expect(aggregatePrnTonnage(db, ledgerRepository)).rejects.toThrow(
      'Unreportable PRN tonnage row for accreditation ACC-1'
    )
  })

  it('refuses to report a row whose registration the organisation does not hold', async () => {
    await db.collection(ORGANISATIONS_COLLECTION).insertOne({
      ...organisationWithRegistration(),
      registrations: [
        { ...reprocessorRegistration(REPROCESSING_TYPE.INPUT), id: 'reg-other' }
      ]
    })
    await db
      .collection(PRNS_COLLECTION)
      .insertOne(prnWithStatus(PRN_STATUS.ACCEPTED, 40))

    await expect(aggregatePrnTonnage(db, ledgerRepository)).rejects.toThrow(
      'Unreportable PRN tonnage row for accreditation ACC-1'
    )
  })

  it('refuses to report a reprocessor registration with no reprocessing type', async () => {
    await db
      .collection(ORGANISATIONS_COLLECTION)
      .insertOne(organisationWithRegistration(reprocessorRegistration(null)))
    await db
      .collection(PRNS_COLLECTION)
      .insertOne(prnWithStatus(PRN_STATUS.ACCEPTED, 40))

    await expect(aggregatePrnTonnage(db, ledgerRepository)).rejects.toThrow(
      'registration.reprocessingType'
    )
  })

  it('refuses to report a registration with no registration number', async () => {
    await db.collection(ORGANISATIONS_COLLECTION).insertOne(
      organisationWithRegistration({
        ...reprocessorRegistration(REPROCESSING_TYPE.INPUT),
        registrationNumber: null
      })
    )
    await db
      .collection(PRNS_COLLECTION)
      .insertOne(prnWithStatus(PRN_STATUS.ACCEPTED, 40))

    await expect(aggregatePrnTonnage(db, ledgerRepository)).rejects.toThrow(
      'registrationNumber'
    )
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

    const { rows } = await aggregatePrnTonnage(db, ledgerRepository)

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

    const { rows } = await aggregatePrnTonnage(db, ledgerRepository)

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

    const { rows } = await aggregatePrnTonnage(db, ledgerRepository)

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

    const { rows } = await aggregatePrnTonnage(db, ledgerRepository)

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

    const { rows } = await aggregatePrnTonnage(db, ledgerRepository)

    expect(rows).toStrictEqual([
      expectedRow({ registrationType: REGISTRATION_TYPE.REPROCESSOR_INPUT })
    ])
  })
})
