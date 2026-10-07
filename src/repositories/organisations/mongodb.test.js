import {
  ACCREDITATION_STATUS,
  ORGANISATION_STATUS,
  REGISTRATION_STATUS
} from '#domain/organisations/model.js'
import { it as mongoIt } from '#vite/fixtures/mongo.js'
import { MongoClient, ObjectId } from 'mongodb'
import crypto from 'node:crypto'
import { beforeEach, describe, expect } from 'vitest'
import {
  buildLinkedDefraOrg,
  buildOrganisation,
  prepareOrgUpdate
} from './contract/test-data.js'
import { createOrganisationsRepository } from './mongodb.js'
import { testOrganisationsRepositoryContract } from './port.contract.js'
import { createMockDb } from '#test/mock-db.js'
import { createMongoError } from '#test/mongo-error.js'

/**
 * @import { OrganisationsRepositoryFactory } from './port.js'
 * @typedef {{ mongoClient: MongoClient, organisationsRepository: OrganisationsRepositoryFactory }} MongoFixtures
 */

const COLLECTION_NAME = 'epr-organisations'
const DATABASE_NAME = 'epr-backend'

const it = /** @type {import('vitest').TestAPI<MongoFixtures>} */ (
  mongoIt.extend({
    mongoClient: async ({ db }, use) => {
      const client = await MongoClient.connect(db)
      await use(client)
      await client.close()
    },

    organisationsRepository: async ({ mongoClient }, use) => {
      const database = mongoClient.db(DATABASE_NAME)
      const factory = await createOrganisationsRepository(database)
      await use(factory)
    }
  })
)

describe('MongoDB organisations repository', () => {
  beforeEach(
    /** @param {MongoFixtures} fixture */ async ({ mongoClient }) => {
      await mongoClient
        .db(DATABASE_NAME)
        .collection(COLLECTION_NAME)
        .deleteMany({})
    }
  )

  describe('organisations repository contract', () => {
    testOrganisationsRepositoryContract(it)
  })

  describe('MongoDB-specific error handling', () => {
    it('rethrows unexpected database errors during insert', async () => {
      const dbMock = createMockDb({
        createIndex: async () => {},
        insertOne: async () => {
          throw createMongoError('Unexpected database error', { code: 99999 })
        }
      })

      const factory = await createOrganisationsRepository(dbMock)
      const repository = factory()
      const orgData = buildOrganisation()

      await expect(repository.insert(orgData)).rejects.toThrow(
        'Unexpected database error'
      )
    })

    it('converts E11000 from replace to a curated Boom.conflict without leaking the raw errmsg', async () => {
      const existingOrg = buildOrganisation()
      const existingDoc = {
        ...existingOrg,
        _id: ObjectId.createFromHexString(existingOrg.id),
        version: 1,
        schemaVersion: 1,
        users: []
      }
      const leakyErrmsg =
        'E11000 duplicate key error collection: epr-backend.epr-organisations index: orgId_1 dup key: { orgId: "conflicting-value" }'
      const dbMock = createMockDb({
        createIndex: async () => {},
        findOne: async () => existingDoc,
        replaceOne: async () => {
          throw createMongoError(leakyErrmsg, {
            code: 11000,
            keyPattern: { orgId: 1 }
          })
        }
      })

      const factory = await createOrganisationsRepository(dbMock)
      const repository = factory()
      const updatePayload = prepareOrgUpdate(existingOrg, {
        wasteProcessingTypes: ['reprocessor']
      })

      await expect(
        repository.replace(existingOrg.id, 1, updatePayload)
      ).rejects.toMatchObject({
        isBoom: true,
        output: {
          statusCode: 409,
          payload: {
            message: expect.stringContaining('orgId')
          }
        },
        event: {
          action: 'update_organisation',
          reason: 'fields=orgId type=Error code=11000'
        }
      })

      await expect(
        repository.replace(existingOrg.id, 1, updatePayload)
      ).rejects.not.toMatchObject({
        message: expect.stringContaining('conflicting-value')
      })
    })

    it('falls back to "unknown" in the dup-key message from replace when keyPattern is absent', async () => {
      const existingOrg = buildOrganisation()
      const existingDoc = {
        ...existingOrg,
        _id: ObjectId.createFromHexString(existingOrg.id),
        version: 1,
        schemaVersion: 1,
        users: []
      }
      const dbMock = createMockDb({
        createIndex: async () => {},
        findOne: async () => existingDoc,
        replaceOne: async () => {
          throw createMongoError('E11000 duplicate key error', { code: 11000 })
        }
      })

      const factory = await createOrganisationsRepository(dbMock)
      const repository = factory()
      const updatePayload = prepareOrgUpdate(existingOrg, {
        wasteProcessingTypes: ['reprocessor']
      })

      await expect(
        repository.replace(existingOrg.id, 1, updatePayload)
      ).rejects.toMatchObject({
        isBoom: true,
        output: {
          statusCode: 409,
          payload: {
            message: expect.stringContaining('unknown')
          }
        }
      })
    })
  })

  describe('findAllLinked query filtering', () => {
    it('excludes documents where linkedDefraOrganisation exists but orgId is null', async ({
      organisationsRepository,
      mongoClient
    }) => {
      const repository = organisationsRepository()
      const collection = mongoClient
        .db(DATABASE_NAME)
        .collection(COLLECTION_NAME)

      const validLinkedOrg = buildOrganisation({
        linkedDefraOrganisation: buildLinkedDefraOrg(
          crypto.randomUUID(),
          'Valid Org'
        )
      })
      await repository.insert(validLinkedOrg)

      const nullOrgIdDoc = buildOrganisation()
      await repository.insert(nullOrgIdDoc)
      await collection.updateOne(
        { _id: ObjectId.createFromHexString(nullOrgIdDoc.id) },
        {
          $set: {
            linkedDefraOrganisation: {
              orgId: null,
              orgName: 'Incomplete Link'
            }
          }
        }
      )

      const result = await repository.findAllLinked()

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe(validLinkedOrg.id)
    })
  })

  describe('status field storage', () => {
    it('does not persist status field to database', async ({
      organisationsRepository,
      mongoClient
    }) => {
      const repository = organisationsRepository()
      const organisation = buildOrganisation()
      await repository.insert(organisation)

      const orgAfterInsert = await repository.findById(organisation.id)
      // Update with status at all levels  (organisation, registration, accreditation)
      await repository.replace(
        organisation.id,
        1,
        prepareOrgUpdate(orgAfterInsert, {
          status: ORGANISATION_STATUS.REJECTED,
          registrations: [
            {
              ...organisation.registrations[0],
              status: REGISTRATION_STATUS.REJECTED
            }
          ],
          accreditations: [
            {
              ...organisation.accreditations[0],
              status: ACCREDITATION_STATUS.REJECTED
            }
          ]
        })
      )

      // Read directly from MongoDB (bypassing repository mapping)
      const rawDoc = /** @type {Record<string, any>} */ (
        await mongoClient
          .db(DATABASE_NAME)
          .collection(COLLECTION_NAME)
          .findOne({ _id: ObjectId.createFromHexString(organisation.id) })
      )

      expect(rawDoc.status).toBeUndefined()
      expect(rawDoc.registrations[0].status).toBeUndefined()
      expect(rawDoc.accreditations[0].status).toBeUndefined()
    })
  })

  describe('registration validTo backward compatibility (PAE-1904)', () => {
    it('does not return validTo on a registration document stored before PAE-1904, without a migration', async ({
      organisationsRepository,
      mongoClient
    }) => {
      const repository = organisationsRepository()
      const organisation = buildOrganisation()
      await repository.insert(organisation)

      // Simulate a document written by an application that predates
      // PAE-1904, i.e. before validTo was removed from the insert/replace
      // schema: write it directly to the collection, bypassing the
      // repository so it never passes through today's schema at all.
      const collection = mongoClient
        .db(DATABASE_NAME)
        .collection(COLLECTION_NAME)
      await collection.updateOne(
        { _id: ObjectId.createFromHexString(organisation.id) },
        { $set: { 'registrations.0.validTo': '2026-12-31' } }
      )

      const rawDoc = /** @type {Record<string, any>} */ (
        await collection.findOne({
          _id: ObjectId.createFromHexString(organisation.id)
        })
      )
      expect(rawDoc.registrations[0].validTo).toBe('2026-12-31')

      const result = await repository.findById(organisation.id)

      expect(result.registrations[0]).not.toHaveProperty('validTo')
    })
  })

  describe('accreditation number storage', () => {
    it('stores no number field for an unnumbered accreditation', async ({
      organisationsRepository,
      mongoClient
    }) => {
      const repository = organisationsRepository()
      const organisation = buildOrganisation()
      await repository.insert(organisation)
      const inserted = await repository.findById(organisation.id)
      await repository.replace(
        organisation.id,
        1,
        prepareOrgUpdate(inserted, { wasteProcessingTypes: ['reprocessor'] })
      )

      const rawDoc = /** @type {Record<string, any>} */ (
        await mongoClient
          .db(DATABASE_NAME)
          .collection(COLLECTION_NAME)
          .findOne({ _id: ObjectId.createFromHexString(organisation.id) })
      )

      expect(rawDoc.version).toBe(2)
      for (const accreditation of rawDoc.accreditations) {
        expect(accreditation).not.toHaveProperty('accreditationNumber')
      }
    })

    it('removes stored null numbers so the unique index can be built', async ({
      mongoClient
    }) => {
      const database = mongoClient.db(DATABASE_NAME)
      const collection = database.collection(COLLECTION_NAME)
      // Start from a collection written before the index existed
      await collection.drop()
      await collection.insertMany([
        {
          orgId: 1,
          accreditations: [
            { id: 'a1', accreditationNumber: null },
            { id: 'a2', accreditationNumber: 'ACC200001' }
          ]
        },
        { orgId: 2, accreditations: [{ id: 'b1', accreditationNumber: null }] }
      ])

      await createOrganisationsRepository(database)

      const rawDocs = await collection
        .find({}, { projection: { _id: 0 } })
        .sort({ orgId: 1 })
        .toArray()
      expect(rawDocs).toStrictEqual([
        {
          orgId: 1,
          accreditations: [
            { id: 'a1' },
            { id: 'a2', accreditationNumber: 'ACC200001' }
          ]
        },
        { orgId: 2, accreditations: [{ id: 'b1' }] }
      ])
      await expect(
        collection.insertOne({
          orgId: 3,
          accreditations: [{ id: 'c1', accreditationNumber: 'ACC200001' }]
        })
      ).rejects.toMatchObject({ code: 11000 })
    })
  })
})
