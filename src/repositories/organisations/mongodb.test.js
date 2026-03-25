import {
  ORGANISATION_STATUS,
  REG_ACC_STATUS
} from '#domain/organisations/model.js'
import { it as mongoIt } from '#vite/fixtures/mongo.js'
import { MongoClient, ObjectId } from 'mongodb'
import crypto from 'node:crypto'
import { beforeEach, describe, expect } from 'vitest'
import {
  buildAccreditation,
  buildLinkedDefraOrg,
  buildOrganisation,
  buildRegistration,
  prepareOrgUpdate
} from './contract/test-data.js'
import { createOrganisationsRepository } from './mongodb.js'
import { testOrganisationsRepositoryContract } from './port.contract.js'

const COLLECTION_NAME = 'epr-organisations'
const DATABASE_NAME = 'epr-backend'

const it = mongoIt.extend({
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

describe('MongoDB organisations repository', () => {
  beforeEach(async ({ mongoClient }) => {
    await mongoClient
      .db(DATABASE_NAME)
      .collection(COLLECTION_NAME)
      .deleteMany({})
  })

  describe('organisations repository contract', () => {
    testOrganisationsRepositoryContract(it)
  })

  describe('MongoDB-specific error handling', () => {
    it('rethrows unexpected database errors during insert', async () => {
      const dbMock = {
        collection: () => ({
          createIndex: async () => {},
          insertOne: async () => {
            const error = new Error('Unexpected database error')
            error.code = 99999
            throw error
          }
        })
      }

      const factory = await createOrganisationsRepository(dbMock)
      const repository = factory()
      const orgData = buildOrganisation()

      await expect(repository.insert(orgData)).rejects.toThrow(
        'Unexpected database error'
      )
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
              status: REG_ACC_STATUS.REJECTED
            }
          ],
          accreditations: [
            {
              ...organisation.accreditations[0],
              status: REG_ACC_STATUS.REJECTED
            }
          ]
        })
      )

      // Read directly from MongoDB (bypassing repository mapping)
      const rawDoc = await mongoClient
        .db(DATABASE_NAME)
        .collection(COLLECTION_NAME)
        .findOne({ _id: ObjectId.createFromHexString(organisation.id) })

      expect(rawDoc.status).toBeUndefined()
      expect(rawDoc.registrations[0].status).toBeUndefined()
      expect(rawDoc.accreditations[0].status).toBeUndefined()
    })
  })

  describe('findAllForOverseasSitesAdminList', () => {
    it('returns only fields required by the ORS admin list endpoint', async ({
      organisationsRepository
    }) => {
      const repository = organisationsRepository()
      const organisation = buildOrganisation()

      await repository.insert(organisation)

      const result = await repository.findAllForOverseasSitesAdminList()

      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({
        orgId: organisation.orgId,
        registrations: expect.any(Array),
        accreditations: expect.any(Array)
      })
      expect(result[0].companyDetails).toBeUndefined()
      expect(result[0].statusHistory).toBeUndefined()
      expect(result[0]._id).toBeUndefined()
    })
  })

  describe('findPageForOverseasSitesAdminList', () => {
    it('returns only the requested page of mapped rows with an exact total', async ({
      organisationsRepository,
      mongoClient
    }) => {
      const repository = organisationsRepository()
      const siteCollection = mongoClient
        .db(DATABASE_NAME)
        .collection('overseas-sites')

      const alphaSiteId = new ObjectId()
      const betaSiteId = new ObjectId()

      await siteCollection.insertMany([
        {
          _id: alphaSiteId,
          name: 'Alpha Reprocessor',
          country: 'France',
          address: {
            line1: '1 Rue de Test',
            townOrCity: 'Paris'
          },
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-01T00:00:00.000Z')
        },
        {
          _id: betaSiteId,
          name: 'Beta Reprocessor',
          country: 'Germany',
          address: {
            line1: '2 Teststrasse',
            townOrCity: 'Berlin'
          },
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-01T00:00:00.000Z')
        }
      ])

      const accreditationId = new ObjectId().toString()
      await repository.insert(
        buildOrganisation({
          registrations: [
            buildRegistration({
              id: new ObjectId().toString(),
              material: 'plastic',
              registrationNumber: 'REG-001',
              accreditationId,
              wasteProcessingType: 'exporter',
              overseasSites: {
                '002': { overseasSiteId: betaSiteId.toString() },
                '001': { overseasSiteId: alphaSiteId.toString() },
                999: { overseasSiteId: new ObjectId().toString() }
              }
            })
          ],
          accreditations: [
            buildAccreditation({
              id: accreditationId,
              accreditationNumber: 'ACC-001'
            })
          ]
        })
      )

      const page = await repository.findPageForOverseasSitesAdminList({
        page: 2,
        pageSize: 1
      })

      expect(page.totalItems).toBe(2)
      expect(page.rows).toStrictEqual([
        {
          orgId: expect.any(Number),
          registrationNumber: 'REG-001',
          accreditationNumber: 'ACC-001',
          orsId: '002',
          packagingWasteCategory: 'plastic',
          destinationCountry: 'Germany',
          overseasReprocessorName: 'Beta Reprocessor',
          addressLine1: '2 Teststrasse',
          addressLine2: null,
          cityOrTown: 'Berlin',
          stateProvinceOrRegion: null,
          postcode: null,
          coordinates: null,
          validFrom: null
        }
      ])
    })

    it('returns empty rows and zero total when the collection is empty', async ({
      organisationsRepository
    }) => {
      const repository = organisationsRepository()

      const page = await repository.findPageForOverseasSitesAdminList({
        page: 1,
        pageSize: 10
      })

      expect(page.rows).toStrictEqual([])
      expect(page.totalItems).toBe(0)
    })
  })
})
