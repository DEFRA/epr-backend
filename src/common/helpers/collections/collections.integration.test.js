import { describe, it, expect, beforeAll, afterAll } from 'vitest'

import { createOrUpdateAccreditationCollection } from './create-update-accreditation.js'
import { createOrUpdateEPROrganisationCollection } from './create-update-epr-organisation.js'
import { createOrUpdateOrganisationCollection } from './create-update-organisation.js'
import { createOrUpdateRegistrationCollection } from './create-update-registration.js'
import {
  createIndexes,
  createOrUpdateCollections,
  createSeedData
} from './create-update.js'
import { eprOrganisationFactory } from './factories/epr-organisation.js'
import { ORG_ID_START_NUMBER } from '#common/enums/index.js'

describe('Collections integration tests', () => {
  let server
  let db

  beforeAll(async () => {
    const { createServer } = await import('#server/server.js')
    server = await createServer()
    await server.initialize()
    db = server.db
  })

  afterAll(async () => {
    await server.stop()
  })

  describe('createOrUpdateAccreditationCollection', () => {
    it('creates collection when it does not exist', async () => {
      await db.dropCollection('accreditation').catch(() => {})

      const collections = await db
        .listCollections({}, { nameOnly: true })
        .toArray()
      await createOrUpdateAccreditationCollection(db, collections)

      const allCollections = await db
        .listCollections({}, { nameOnly: true })
        .toArray()
      expect(
        allCollections.find(({ name }) => name === 'accreditation')
      ).toBeDefined()
    })

    it('modifies collection when it already exists', async () => {
      const collections = await db
        .listCollections({}, { nameOnly: true })
        .toArray()
      expect(
        collections.find(({ name }) => name === 'accreditation')
      ).toBeDefined()

      await createOrUpdateAccreditationCollection(db, collections)

      const allCollections = await db
        .listCollections({}, { nameOnly: true })
        .toArray()
      expect(
        allCollections.find(({ name }) => name === 'accreditation')
      ).toBeDefined()
    })
  })

  describe('createOrUpdateOrganisationCollection', () => {
    it('creates collection when it does not exist', async () => {
      await db.dropCollection('organisation').catch(() => {})

      const collections = await db
        .listCollections({}, { nameOnly: true })
        .toArray()
      await createOrUpdateOrganisationCollection(db, collections)

      const allCollections = await db
        .listCollections({}, { nameOnly: true })
        .toArray()
      expect(
        allCollections.find(({ name }) => name === 'organisation')
      ).toBeDefined()
    })

    it('modifies collection when it already exists', async () => {
      const collections = await db
        .listCollections({}, { nameOnly: true })
        .toArray()
      expect(
        collections.find(({ name }) => name === 'organisation')
      ).toBeDefined()

      await createOrUpdateOrganisationCollection(db, collections)

      const allCollections = await db
        .listCollections({}, { nameOnly: true })
        .toArray()
      expect(
        allCollections.find(({ name }) => name === 'organisation')
      ).toBeDefined()
    })
  })

  describe('createOrUpdateRegistrationCollection', () => {
    it('creates collection when it does not exist', async () => {
      await db.dropCollection('registration').catch(() => {})

      const collections = await db
        .listCollections({}, { nameOnly: true })
        .toArray()
      await createOrUpdateRegistrationCollection(db, collections)

      const allCollections = await db
        .listCollections({}, { nameOnly: true })
        .toArray()
      expect(
        allCollections.find(({ name }) => name === 'registration')
      ).toBeDefined()
    })

    it('modifies collection when it already exists', async () => {
      const collections = await db
        .listCollections({}, { nameOnly: true })
        .toArray()
      expect(
        collections.find(({ name }) => name === 'registration')
      ).toBeDefined()

      await createOrUpdateRegistrationCollection(db, collections)

      const allCollections = await db
        .listCollections({}, { nameOnly: true })
        .toArray()
      expect(
        allCollections.find(({ name }) => name === 'registration')
      ).toBeDefined()
    })
  })

  describe('createOrUpdateEPROrganisationCollection', () => {
    it('ensures epr-organisations collection exists', async () => {
      const collections = await db
        .listCollections({}, { nameOnly: true })
        .toArray()
      await createOrUpdateEPROrganisationCollection(db, collections)

      const allCollections = await db
        .listCollections({}, { nameOnly: true })
        .toArray()
      expect(
        allCollections.find(({ name }) => name === 'epr-organisations')
      ).toBeDefined()
    })
  })

  describe('createOrUpdateCollections', () => {
    it('creates all collections', async () => {
      await createOrUpdateCollections(db)

      const collections = await db
        .listCollections({}, { nameOnly: true })
        .toArray()
      expect(
        collections.find(({ name }) => name === 'organisation')
      ).toBeDefined()
      expect(
        collections.find(({ name }) => name === 'registration')
      ).toBeDefined()
      expect(
        collections.find(({ name }) => name === 'accreditation')
      ).toBeDefined()
      expect(
        collections.find(({ name }) => name === 'epr-organisations')
      ).toBeDefined()
    })
  })

  describe('createIndexes', () => {
    it('creates indexes on all collections', async () => {
      await createIndexes(db)

      const mongoLocksIndexes = await db.collection('mongo-locks').indexes()
      expect(mongoLocksIndexes.find((idx) => idx.key.id === 1)).toBeDefined()

      const organisationIndexes = await db.collection('organisation').indexes()
      expect(
        organisationIndexes.find((idx) => idx.key.orgId === 1)
      ).toBeDefined()

      const registrationIndexes = await db.collection('registration').indexes()
      expect(
        registrationIndexes.find((idx) => idx.key.referenceNumber === 1)
      ).toBeDefined()

      const accreditationIndexes = await db
        .collection('accreditation')
        .indexes()
      expect(
        accreditationIndexes.find((idx) => idx.key.referenceNumber === 1)
      ).toBeDefined()
    })
  })

  describe('createSeedData', () => {
    it('ensures seed data exists after calling', async () => {
      await createSeedData(db)

      const org = await db
        .collection('organisation')
        .findOne({ orgId: ORG_ID_START_NUMBER })
      expect(org).toBeDefined()
      expect(org.orgId).toBe(ORG_ID_START_NUMBER)
      expect(org.orgName).toBeDefined()
      expect(org.email).toBeDefined()
      expect(org.answers).toBeDefined()

      const registration = await db
        .collection('registration')
        .findOne({ orgId: ORG_ID_START_NUMBER })
      expect(registration).toBeDefined()
      expect(registration.referenceNumber).toBe(org._id.toString())
      expect(registration.orgId).toBe(ORG_ID_START_NUMBER)

      const accreditation = await db
        .collection('accreditation')
        .findOne({ orgId: ORG_ID_START_NUMBER })
      expect(accreditation).toBeDefined()
      expect(accreditation.referenceNumber).toBe(org._id.toString())
      expect(accreditation.orgId).toBe(ORG_ID_START_NUMBER)
    })

    it('does not insert duplicate data when called twice', async () => {
      await createSeedData(db)

      const orgCountBefore = await db
        .collection('organisation')
        .countDocuments({ orgId: ORG_ID_START_NUMBER })

      await createSeedData(db)

      const orgCountAfter = await db
        .collection('organisation')
        .countDocuments({ orgId: ORG_ID_START_NUMBER })

      expect(orgCountAfter).toBe(orgCountBefore)
      expect(orgCountAfter).toBeGreaterThanOrEqual(1)
    })
  })

  describe('eprOrganisationFactory', () => {
    it('transforms epr organisation data correctly', () => {
      const input = {
        id: '507f1f77bcf86cd799439011',
        name: 'Test Org',
        someField: 'value'
      }

      const result = eprOrganisationFactory(input)

      expect(result).toHaveProperty('_id')
      expect(result._id.toString()).toBe('507f1f77bcf86cd799439011')
      expect(result).toHaveProperty('schemaVersion', 1)
      expect(result).toHaveProperty('name', 'Test Org')
      expect(result).toHaveProperty('someField', 'value')
      expect(result).not.toHaveProperty('id')
    })

    it('works with EPR organisation seed data', () => {
      const input = {
        id: '507f1f77bcf86cd799439011',
        organisationId: '100001',
        organisationName: 'Example Ltd'
      }

      const result = eprOrganisationFactory(input)

      expect(result._id.toString()).toBe('507f1f77bcf86cd799439011')
      expect(result.organisationId).toBe('100001')
      expect(result.organisationName).toBe('Example Ltd')
      expect(result.schemaVersion).toBe(1)
    })
  })
})
