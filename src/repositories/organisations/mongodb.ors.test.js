import { it as mongoIt } from '#vite/fixtures/mongo.js'
import { MongoClient, ObjectId } from 'mongodb'
import { describe, expect } from 'vitest'
import { createOrganisationsRepository } from './mongodb.js'

const DATABASE_NAME = 'epr-backend'
const COLLECTION_NAME = 'epr-organisations'

const it = mongoIt.extend({
  mongoClient: async ({ db }, use) => {
    const client = await MongoClient.connect(db)
    await use(client)
    await client.close()
  },

  repository: async ({ mongoClient }, use) => {
    const database = mongoClient.db(DATABASE_NAME)
    await database.collection(COLLECTION_NAME).deleteMany({})
    const factory = await createOrganisationsRepository(database)
    await use(factory())
  },

  database: async ({ mongoClient }, use) => {
    await use(mongoClient.db(DATABASE_NAME))
  }
})

const buildOrganisation = (overrides = {}) => {
  const orgId = overrides.orgId ?? 500001
  const id = overrides.id ?? new ObjectId().toHexString()

  return {
    _id: ObjectId.createFromHexString(id),
    orgId,
    version: 1,
    schemaVersion: 1,
    companyDetails: { name: 'Test Org' },
    formSubmissionTime: new Date().toISOString(),
    submittedToRegulator: 'EA',
    submitterContactDetails: {
      fullName: 'Test User',
      email: 'test@example.com'
    },
    wasteProcessingTypes: ['exporter'],
    statusHistory: [{ status: 'created', updatedAt: new Date() }],
    registrations: [
      {
        id: 'reg-001',
        registrationNumber: 'EPR/AB1234CD/R1',
        wasteProcessingType: 'exporter',
        material: 'Plastic',
        orgName: 'Test Org',
        formSubmissionTime: new Date().toISOString(),
        submittedToRegulator: 'EA',
        reprocessingType: null,
        submitterContactDetails: {
          fullName: 'Test User',
          email: 'test@example.com'
        },
        approvedPersons: [{ fullName: 'Test User', email: 'test@example.com' }],
        suppliers: 'Test Supplier',
        exportPorts: ['Southampton'],
        samplingInspectionPlanPart1FileUploads: [],
        orsFileUploads: [
          {
            fileId: 'file-1',
            name: 'ors.xlsx',
            s3Key: 's3://bucket/ors.xlsx'
          }
        ],
        overseasSites: {},
        statusHistory: [{ status: 'approved', updatedAt: new Date() }]
      }
    ],
    accreditations: [],
    users: [],
    ...overrides
  }
}

describe('Organisations repository - ORS operations', () => {
  describe('findByOrgId', () => {
    it('finds an organisation by its business orgId', async ({
      repository,
      database
    }) => {
      const org = buildOrganisation({ orgId: 500042 })
      await database.collection(COLLECTION_NAME).insertOne(org)

      const found = await repository.findByOrgId(500042)

      expect(found).not.toBeNull()
      expect(found.orgId).toBe(500042)
      expect(found.id).toBe(org._id.toHexString())
    })

    it('returns null when orgId does not exist', async ({ repository }) => {
      const found = await repository.findByOrgId(999999)
      expect(found).toBeNull()
    })
  })

  describe('mergeRegistrationOverseasSites', () => {
    it('merges new entries into the overseas sites map', async ({
      repository,
      database
    }) => {
      const orgId = new ObjectId().toHexString()
      const org = buildOrganisation({ id: orgId, orgId: 500001 })
      await database.collection(COLLECTION_NAME).insertOne(org)

      const entries = {
        '001': { overseasSiteId: 'site-aaa' },
        '002': { overseasSiteId: 'site-bbb' }
      }

      const result = await repository.mergeRegistrationOverseasSites(
        orgId,
        1,
        'reg-001',
        entries
      )

      expect(result).toBe(true)

      const updated = await database
        .collection(COLLECTION_NAME)
        .findOne({ _id: ObjectId.createFromHexString(orgId) })

      expect(updated.registrations[0].overseasSites).toEqual({
        '001': { overseasSiteId: 'site-aaa' },
        '002': { overseasSiteId: 'site-bbb' }
      })
      expect(updated.version).toBe(2)
    })

    it('preserves existing entries not in the update', async ({
      repository,
      database
    }) => {
      const orgId = new ObjectId().toHexString()
      const org = buildOrganisation({ id: orgId })
      org.registrations[0].overseasSites = {
        '010': { overseasSiteId: 'existing-site' }
      }
      await database.collection(COLLECTION_NAME).insertOne(org)

      const entries = {
        '001': { overseasSiteId: 'new-site' }
      }

      await repository.mergeRegistrationOverseasSites(
        orgId,
        1,
        'reg-001',
        entries
      )

      const updated = await database
        .collection(COLLECTION_NAME)
        .findOne({ _id: ObjectId.createFromHexString(orgId) })

      expect(updated.registrations[0].overseasSites).toEqual({
        '010': { overseasSiteId: 'existing-site' },
        '001': { overseasSiteId: 'new-site' }
      })
    })

    it('overwrites existing keys with new values', async ({
      repository,
      database
    }) => {
      const orgId = new ObjectId().toHexString()
      const org = buildOrganisation({ id: orgId })
      org.registrations[0].overseasSites = {
        '001': { overseasSiteId: 'old-site' }
      }
      await database.collection(COLLECTION_NAME).insertOne(org)

      const entries = {
        '001': { overseasSiteId: 'new-site' }
      }

      await repository.mergeRegistrationOverseasSites(
        orgId,
        1,
        'reg-001',
        entries
      )

      const updated = await database
        .collection(COLLECTION_NAME)
        .findOne({ _id: ObjectId.createFromHexString(orgId) })

      expect(updated.registrations[0].overseasSites['001']).toEqual({
        overseasSiteId: 'new-site'
      })
    })

    it('returns false on version conflict', async ({
      repository,
      database
    }) => {
      const orgId = new ObjectId().toHexString()
      const org = buildOrganisation({ id: orgId })
      await database.collection(COLLECTION_NAME).insertOne(org)

      const result = await repository.mergeRegistrationOverseasSites(
        orgId,
        999,
        'reg-001',
        { '001': { overseasSiteId: 'site' } }
      )

      expect(result).toBe(false)
    })
  })
})
