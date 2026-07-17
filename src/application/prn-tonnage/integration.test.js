import { describe, beforeEach, expect } from 'vitest'
import { it as mongoIt } from '#vite/fixtures/mongo.js'
import { MongoClient, ObjectId } from 'mongodb'
import { aggregatePrnTonnage } from './aggregate-prn-tonnage.js'
import { MATERIAL, TONNAGE_BAND } from '#domain/organisations/model.js'
import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'
import {
  buildPrn,
  buildAccreditation
} from '#packaging-recycling-notes/repository/contract/test-data.js'

/** @import { PrnStatus } from '#packaging-recycling-notes/domain/model.js' */

const DATABASE_NAME = 'epr-backend'
const PRNS_COLLECTION = 'packaging-recycling-notes'
const ORGANISATIONS_COLLECTION = 'epr-organisations'

const it = mongoIt.extend({
  mongoClient: async (/** @type {{ db: string }} */ { db }, use) => {
    const client = await MongoClient.connect(db)
    await use(client)
    await client.close()
  }
})

const orgId = '507f1f77bcf86cd799439011'
const accId = 'acc-1'

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
    organisation: { id: orgId, name: 'Acme Reprocessing' },
    accreditation: buildAccreditation({
      id: accId,
      accreditationNumber: 'ACC-1',
      material: MATERIAL.PLASTIC
    }),
    tonnage,
    status: withStatus(currentStatus)
  })

describe('aggregatePrnTonnage - Integration', () => {
  let db

  beforeEach(
    async (
      /** @type {{ mongoClient: import('mongodb').MongoClient }} */ {
        mongoClient
      }
    ) => {
      db = mongoClient.db(DATABASE_NAME)
      await db.collection(PRNS_COLLECTION).deleteMany({})
      await db.collection(ORGANISATIONS_COLLECTION).deleteMany({})
    }
  )

  it('buckets tonnage by status and resolves tonnageBand from the org lookup', async () => {
    await db.collection(ORGANISATIONS_COLLECTION).insertOne({
      _id: new ObjectId(orgId),
      accreditations: [
        { id: accId, prnIssuance: { tonnageBand: TONNAGE_BAND.UP_TO_5000 } }
      ]
    })
    await db
      .collection(PRNS_COLLECTION)
      .insertMany([
        prnWithStatus(PRN_STATUS.AWAITING_AUTHORISATION, 10),
        prnWithStatus(PRN_STATUS.AWAITING_ACCEPTANCE, 20),
        prnWithStatus(PRN_STATUS.AWAITING_CANCELLATION, 30),
        prnWithStatus(PRN_STATUS.ACCEPTED, 40),
        prnWithStatus(PRN_STATUS.CANCELLED, 50)
      ])

    const { rows } = await aggregatePrnTonnage(db)

    expect(rows).toStrictEqual([
      {
        organisationName: 'Acme Reprocessing',
        organisationId: orgId,
        accreditationNumber: 'ACC-1',
        material: MATERIAL.PLASTIC,
        tonnageBand: TONNAGE_BAND.UP_TO_5000,
        awaitingAuthorisationTonnage: 10,
        awaitingAcceptanceTonnage: 20,
        awaitingCancellationTonnage: 30,
        acceptedTonnage: 40,
        cancelledTonnage: 50
      }
    ])
  })

  it('excludes deleted and discarded prns', async () => {
    await db
      .collection(PRNS_COLLECTION)
      .insertMany([
        prnWithStatus(PRN_STATUS.DELETED, 100),
        prnWithStatus(PRN_STATUS.DISCARDED, 200)
      ])

    const { rows } = await aggregatePrnTonnage(db)

    expect(rows).toStrictEqual([])
  })

  it('resolves tonnageBand to null when no matching organisation exists', async () => {
    await db
      .collection(PRNS_COLLECTION)
      .insertOne(prnWithStatus(PRN_STATUS.ACCEPTED, 40))

    const { rows } = await aggregatePrnTonnage(db)

    expect(rows).toStrictEqual([
      {
        organisationName: 'Acme Reprocessing',
        organisationId: orgId,
        accreditationNumber: 'ACC-1',
        material: MATERIAL.PLASTIC,
        tonnageBand: null,
        awaitingAuthorisationTonnage: 0,
        awaitingAcceptanceTonnage: 0,
        awaitingCancellationTonnage: 0,
        acceptedTonnage: 40,
        cancelledTonnage: 0
      }
    ])
  })
})
