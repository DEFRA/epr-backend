import { randomUUID } from 'node:crypto'
import { describe, expect, vi } from 'vitest'
import { it as mongoIt } from '#vite/fixtures/mongo.js'
import { MongoClient } from 'mongodb'
import { createSummaryLogsRepository } from './mongodb.js'
import { testSummaryLogsRepositoryContract } from './port.contract.js'
import { createMockLogger } from '#test/mock-logger.js'
import {
  summaryLogFactory,
  withoutAccreditationId
} from './contract/test-data.js'
import { createMockDb } from '#test/mock-db.js'
import { createMongoError } from '#test/mongo-error.js'
import { partialMock } from '#test/type-helpers.js'
import {
  toOrganisationNumber,
  toRegistrationNumber
} from '#domain/organisations/numbers.js'
import { toSummaryLogId } from '#domain/summary-logs/ids.js'
import { toYear } from '#common/helpers/dates/year.js'

/**
 * @import { SummaryLogsS3Config } from './mongodb.js'
 * @import { SummaryLogsRepositoryFactory, SummaryLogsRepository } from './port.js'
 * @import { SummaryLog } from '#domain/summary-logs/model.js'
 * @typedef {{ mongoClient: MongoClient, summaryLogsRepositoryFactory: SummaryLogsRepositoryFactory, summaryLogsRepository: SummaryLogsRepository }} SummaryLogsFixtures
 */

const DATABASE_NAME = 'epr-backend'

const SIXTY_SECONDS = 60

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockImplementation(async (_client, command) => {
    return `https://${command.input.Bucket}.s3.amazonaws.com/${command.input.Key}?signed=true`
  })
}))

/** @type {SummaryLogsS3Config} */
const mockS3Config = {
  s3Client: partialMock({}),
  preSignedUrlExpiry: SIXTY_SECONDS
}

const it = /** @type {import('vitest').TestAPI<SummaryLogsFixtures>} */ (
  mongoIt.extend({
    mongoClient: async ({ db }, use) => {
      const client = await MongoClient.connect(db)
      await use(client)
      await client.close()
    },

    summaryLogsRepositoryFactory: async ({ mongoClient }, use) => {
      const database = mongoClient.db(DATABASE_NAME)
      const factory = await createSummaryLogsRepository(database, mockS3Config)
      await use(factory)
    },

    summaryLogsRepository: async ({ summaryLogsRepositoryFactory }, use) => {
      const repository = summaryLogsRepositoryFactory(createMockLogger())
      await use(repository)
    }
  })
)

describe('MongoDB summary logs repository', () => {
  describe('summary logs repository contract', () => {
    testSummaryLogsRepositoryContract(it)
  })

  // Not a contract assertion: the in-memory adapter fabricates its URL.
  describe('getDownloadUrl names the file', () => {
    /** @returns {Promise<string | undefined>} */
    const lastSignedDisposition = async () => {
      const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner')
      const input = /** @type {{ ResponseContentDisposition?: string }} */ (
        vi.mocked(getSignedUrl).mock.lastCall?.[1].input
      )

      return input?.ResponseContentDisposition
    }

    /**
     * @param {SummaryLogsRepository} repository
     * @param {Record<string, unknown>} [overrides]
     * @param {(overrides: Record<string, unknown>) => SummaryLog} [build]
     * @returns {Promise<string>}
     */
    const insertLog = async (
      repository,
      overrides = {},
      build = summaryLogFactory.submitted
    ) => {
      const id = `mongo-${randomUUID()}`
      await repository.insert(
        toSummaryLogId(id),
        build({
          organisationId: 'org-1',
          registrationId: 'reg-1',
          file: { uri: 's3://re-ex-summary-logs/uploads/test-file.xlsx' },
          ...overrides
        })
      )

      return id
    }

    it('names it for the registration and the moment it was submitted', async ({
      summaryLogsRepository
    }) => {
      const id = await insertLog(summaryLogsRepository, {
        submittedAt: '2026-06-01T13:00:00.000Z'
      })

      await summaryLogsRepository.getDownloadUrl(
        toSummaryLogId(id),
        toRegistrationNumber('R26ER5000000002PA')
      )

      expect(await lastSignedDisposition()).toBe(
        'attachment; filename="R26ER5000000002PA-2026-06-01-130000.xlsx"'
      )
    })

    it('names a resubmission on the same day differently', async ({
      summaryLogsRepository
    }) => {
      const morning = await insertLog(summaryLogsRepository, {
        submittedAt: '2024-01-01T09:15:30.000Z'
      })
      const afternoon = await insertLog(summaryLogsRepository, {
        submittedAt: '2024-01-01T16:42:07.000Z'
      })

      await summaryLogsRepository.getDownloadUrl(
        toSummaryLogId(morning),
        toRegistrationNumber('R26ER5000000002PA')
      )
      const first = await lastSignedDisposition()

      await summaryLogsRepository.getDownloadUrl(
        toSummaryLogId(afternoon),
        toRegistrationNumber('R26ER5000000002PA')
      )

      expect(first).toBe(
        'attachment; filename="R26ER5000000002PA-2024-01-01-091530.xlsx"'
      )
      expect(await lastSignedDisposition()).toBe(
        'attachment; filename="R26ER5000000002PA-2024-01-01-164207.xlsx"'
      )
    })

    it.for([
      { status: 'invalid', build: summaryLogFactory.invalid },
      {
        status: 'validation failed',
        build: summaryLogFactory.validationFailed
      },
      { status: 'validated', build: summaryLogFactory.validated },
      { status: 'superseded', build: summaryLogFactory.superseded }
    ])(
      'names an upload never submitted ($status) for the moment it was uploaded',
      async ({ build }, { summaryLogsRepository }) => {
        const id = await insertLog(
          summaryLogsRepository,
          { createdAt: '2024-02-03T04:05:06.000Z' },
          build
        )

        await summaryLogsRepository.getDownloadUrl(
          toSummaryLogId(id),
          toRegistrationNumber('R26ER5000000002PA')
        )

        expect(await lastSignedDisposition()).toBe(
          'attachment; filename="R26ER5000000002PA-2024-02-03-040506.xlsx"'
        )
      }
    )

    it('names it not at all where the registration carries no number', async ({
      summaryLogsRepository
    }) => {
      const id = await insertLog(summaryLogsRepository)

      await summaryLogsRepository.getDownloadUrl(toSummaryLogId(id))

      expect(await lastSignedDisposition()).toBeUndefined()
    })
  })

  describe('legacy index migration', () => {
    it('creates the submitting lock on the numbers before dropping the locks it replaces', async () => {
      const calls = []
      const createdIndexes = []

      const mockDb = createMockDb({
        dropIndex: async (indexName) => {
          calls.push(`drop:${indexName}`)
        },
        createIndex: async (fields, options) => {
          calls.push(`create:${options?.name}`)
          createdIndexes.push({ fields, options })
        }
      })

      await createSummaryLogsRepository(mockDb, mockS3Config)

      expect(calls.filter((c) => c.startsWith('drop:'))).toEqual([
        'drop:organisationId_1_registrationId_1',
        'drop:summary_log_submitting_lock',
        'drop:organisationId_1_registrationId_1_year_1_accreditationId_1_status_1_submittedAt_-1',
        'drop:organisationId_1_registrationId_1_status_1_submittedAt_-1'
      ])
      expect(
        calls.indexOf('create:summary_log_submitting_lock_by_number')
      ).toBeLessThan(calls.indexOf('drop:organisationId_1_registrationId_1'))
      const lockIndex = createdIndexes.find(
        (idx) => idx.options.name === 'summary_log_submitting_lock_by_number'
      )
      expect(lockIndex.fields).toStrictEqual({
        organisationNumber: 1,
        registrationNumber: 1,
        year: 1,
        accreditationNumber: 1
      })
    })

    it('reads by number through an index on the numbers, and drops the year-scoped id index no read uses', async ({
      mongoClient
    }) => {
      const database = mongoClient.db(`${DATABASE_NAME}-${randomUUID()}`)
      const collection = database.collection('summary-logs')
      await collection.createIndex({
        organisationId: 1,
        registrationId: 1,
        year: 1,
        accreditationId: 1,
        status: 1,
        submittedAt: -1
      })

      await createSummaryLogsRepository(database, mockS3Config)

      const keys = (await collection.indexes()).map(({ key }) => key)
      expect(keys).toContainEqual({
        organisationNumber: 1,
        registrationNumber: 1,
        status: 1,
        submittedAt: -1
      })
      expect(keys).not.toContainEqual(
        expect.objectContaining({ year: 1, accreditationId: 1, status: 1 })
      )
      await database.dropDatabase()
    })

    it('drops the id index the list by registration read through', async ({
      mongoClient
    }) => {
      const database = mongoClient.db(`${DATABASE_NAME}-${randomUUID()}`)
      const collection = database.collection('summary-logs')
      await collection.createIndex({
        organisationId: 1,
        registrationId: 1,
        status: 1,
        submittedAt: -1
      })

      await createSummaryLogsRepository(database, mockS3Config)

      const keys = (await collection.indexes()).map(({ key }) => key)
      expect(keys).not.toContainEqual(
        expect.objectContaining({ organisationId: 1, status: 1 })
      )
      await database.dropDatabase()
    })

    it.each(['IndexNotFound', 'NamespaceNotFound'])(
      'ignores %s when dropping a retired index',
      async (codeName) => {
        const mockDb = createMockDb({
          dropIndex: async () => {
            throw createMongoError('index missing', { codeName })
          },
          createIndex: async () => {}
        })

        await expect(
          createSummaryLogsRepository(mockDb, mockS3Config)
        ).resolves.toBeDefined()
      }
    )

    it('re-throws other errors from dropIndex', async () => {
      const mockDb = createMockDb({
        dropIndex: async () => {
          throw createMongoError('Connection timeout', { code: 'ETIMEOUT' })
        }
      })

      await expect(
        createSummaryLogsRepository(mockDb, mockS3Config)
      ).rejects.toThrow('Connection timeout')
    })
  })

  describe('MongoDB-specific error handling', () => {
    it('re-throws non-duplicate key errors from MongoDB', async () => {
      const mockDb = createMockDb({
        createIndex: async () => {},
        findOne: async () => null, // No existing submitting log
        insertOne: async () => {
          throw createMongoError('Connection timeout', { code: 'ETIMEOUT' })
        }
      })

      const repositoryFactory = await createSummaryLogsRepository(
        mockDb,
        mockS3Config
      )
      const repository = repositoryFactory(createMockLogger())

      await expect(
        repository.insert(
          toSummaryLogId(`test-${randomUUID()}`),
          summaryLogFactory.validating()
        )
      ).rejects.toThrow('Connection timeout')
    })
  })

  describe('transitionToSubmittingExclusive edge cases', () => {
    it('returns success: false when unique index violation occurs (race condition)', async () => {
      const logId = `test-${randomUUID()}`

      const mockDb = createMockDb({
        createIndex: async () => {},
        findOneAndUpdate: async () => {
          // Another request beat us and the unique index blocks our update
          throw createMongoError(
            'E11000 duplicate key error collection: epr-backend.summary-logs',
            { code: 11000 }
          )
        }
      })

      const repositoryFactory = await createSummaryLogsRepository(
        mockDb,
        mockS3Config
      )
      const repository = repositoryFactory(createMockLogger())

      const result = await repository.transitionToSubmittingExclusive(
        toSummaryLogId(logId)
      )

      expect(result.success).toBe(false)
    })

    it('re-throws non-duplicate key errors from findOneAndUpdate', async () => {
      const logId = `test-${randomUUID()}`

      const mockDb = createMockDb({
        createIndex: async () => {},
        findOneAndUpdate: async () => {
          throw createMongoError('Connection timeout', { code: 'ETIMEOUT' })
        }
      })

      const repositoryFactory = await createSummaryLogsRepository(
        mockDb,
        mockS3Config
      )
      const repository = repositoryFactory(createMockLogger())

      await expect(
        repository.transitionToSubmittingExclusive(toSummaryLogId(logId))
      ).rejects.toThrow('Connection timeout')
    })
  })

  describe('legacy numeric row IDs', () => {
    const category = (rowIds) => ({ count: rowIds.length, rowIds })

    const validity = (rowIds) => ({
      valid: category(rowIds),
      invalid: category([]),
      included: category([]),
      excluded: category([])
    })

    /**
     * Summary logs written before ROW_ID coercion hold row IDs as numbers.
     * No current writer produces that shape and the storage schema rejects it,
     * so the document has to be seeded straight into the collection.
     */
    const insertLegacySummaryLog = async (mongoClient, overrides) => {
      const id = `legacy-rowids-${randomUUID()}`

      await mongoClient
        .db(DATABASE_NAME)
        .collection('summary-logs')
        .insertOne({
          _id: id,
          version: 1,
          ...summaryLogFactory.submitted(overrides),
          loads: {
            added: validity([1000, 1001]),
            unchanged: validity([]),
            adjusted: validity([])
          }
        })

      return id
    }

    it('findById returns them as strings', async ({
      mongoClient,
      summaryLogsRepository
    }) => {
      const id = await insertLegacySummaryLog(mongoClient, {})

      const found = await summaryLogsRepository.findById(toSummaryLogId(id))

      expect(found?.summaryLog.loads?.added.valid.rowIds).toEqual([
        '1000',
        '1001'
      ])
    })

    it('findAll returns them as strings', async ({
      mongoClient,
      summaryLogsRepository
    }) => {
      const key = {
        organisationNumber: toOrganisationNumber(
          String(Math.floor(Math.random() * 1e9) + 1)
        ),
        registrationNumber: toRegistrationNumber(`reg-${randomUUID()}`)
      }
      await insertLegacySummaryLog(mongoClient, key)

      const results = await summaryLogsRepository.findAll(key)

      expect(results[0]?.summaryLog.loads?.added.valid.rowIds).toEqual([
        '1000',
        '1001'
      ])
    })
  })

  describe('a summary log that records no accreditation', () => {
    /**
     * Production holds two summary logs stored before accreditations were
     * recorded. The insert schema refuses that shape, so the document has to be
     * seeded straight into the collection.
     *
     * @param {MongoClient} mongoClient
     * @param {object} summaryLog
     */
    const insertUnrecorded = async (mongoClient, summaryLog) => {
      const id = toSummaryLogId(`unrecorded-${randomUUID()}`)

      await mongoClient
        .db(DATABASE_NAME)
        .collection('summary-logs')
        .insertOne(
          /** @type {object} */ ({
            _id: id,
            version: 1,
            ...withoutAccreditationId(
              /** @type {{ accreditationId?: string | null }} */ (summaryLog)
            )
          })
        )

      return id
    }

    const aRegistration = () => ({
      organisationId: `org-${randomUUID()}`,
      registrationId: `reg-${randomUUID()}`
    })

    it('is not found by id or by file id', async ({
      mongoClient,
      summaryLogsRepository
    }) => {
      const summaryLog = summaryLogFactory.validated(aRegistration())
      const id = await insertUnrecorded(mongoClient, summaryLog)

      expect(await summaryLogsRepository.findById(id)).toBeNull()
      expect(
        await summaryLogsRepository.findByFileId(summaryLog.file.id)
      ).toBeNull()
    })

    it('is not found by its registration, whichever accreditation the key names', async ({
      mongoClient,
      summaryLogsRepository
    }) => {
      const summaryLog = summaryLogFactory.submitted(aRegistration())
      await insertUnrecorded(mongoClient, summaryLog)
      const { organisationNumber, registrationNumber } = summaryLog

      for (const key of [
        { organisationNumber, registrationNumber },
        { organisationNumber, registrationNumber, accreditationNumber: null }
      ]) {
        expect(await summaryLogsRepository.findLatestSubmitted(key)).toBeNull()
        expect(await summaryLogsRepository.findAll(key)).toEqual([])
      }
    })

    it('does not hide a recorded log holding the same file', async ({
      mongoClient,
      summaryLogsRepository
    }) => {
      const unrecorded = summaryLogFactory.submitted(aRegistration())
      await insertUnrecorded(mongoClient, unrecorded)
      await summaryLogsRepository.insert(
        toSummaryLogId(`recorded-${randomUUID()}`),
        summaryLogFactory.submitted({
          ...aRegistration(),
          file: unrecorded.file
        })
      )

      const found = await summaryLogsRepository.findByFileId(unrecorded.file.id)
      const download = await summaryLogsRepository.getDownloadUrlByFileId(
        unrecorded.file.id
      )

      expect(found?.summaryLog.accreditationNumber).toBeNull()
      expect(found?.summaryLog).not.toHaveProperty('accreditationId')
      expect(download.accreditationNumber).toBeNull()
    })

    it('cannot be submitted', async ({
      mongoClient,
      summaryLogsRepository
    }) => {
      const id = await insertUnrecorded(
        mongoClient,
        summaryLogFactory.validated(aRegistration())
      )

      await expect(
        summaryLogsRepository.transitionToSubmittingExclusive(id)
      ).rejects.toMatchObject({ isBoom: true, output: { statusCode: 404 } })
    })

    it('has no download to sign', async ({
      mongoClient,
      summaryLogsRepository
    }) => {
      const id = await insertUnrecorded(
        mongoClient,
        summaryLogFactory.submitted(aRegistration())
      )

      await expect(
        summaryLogsRepository.getDownloadUrl(id)
      ).rejects.toMatchObject({ isBoom: true, output: { statusCode: 404 } })
    })

    it('blocks a registered-only submission while it is submitting in the same year', async ({
      mongoClient,
      summaryLogsRepository
    }) => {
      const ids = aRegistration()
      await insertUnrecorded(
        mongoClient,
        summaryLogFactory.submitting({ ...ids, year: toYear(2026) })
      )
      const registeredOnlyId = toSummaryLogId(`registered-only-${randomUUID()}`)
      await summaryLogsRepository.insert(
        registeredOnlyId,
        summaryLogFactory.validated({
          ...ids,
          year: toYear(2026),
          accreditationId: null
        })
      )

      const registeredOnly =
        await summaryLogsRepository.transitionToSubmittingExclusive(
          registeredOnlyId
        )

      expect(registeredOnly.success).toBe(false)
    })
  })

  // Not a contract assertion: only stored documents show what was written.
  describe('organisation, registration and accreditation database ids', () => {
    /** @param {MongoClient} mongoClient */
    const collection = (mongoClient) =>
      mongoClient.db(DATABASE_NAME).collection('summary-logs')

    /**
     * @param {MongoClient} mongoClient
     * @param {string} id
     */
    const storedDocument = (mongoClient, id) =>
      collection(mongoClient).findOne(/** @type {any} */ ({ _id: id }))

    const DATABASE_ID_FIELDS = [
      'organisationId',
      'registrationId',
      'accreditationId'
    ]

    /** @param {object | null | undefined} document */
    const databaseIdsIn = (document) =>
      DATABASE_ID_FIELDS.filter((field) => document && field in document)

    // The two accreditation shapes a summary log was stored in before summary
    // logs dropped their database ids.
    const OLDER_SHAPES = [
      {
        name: 'uploaded for an accreditation',
        stored: { accreditationId: 'acc-1', accreditationNumber: 'ACC-1' },
        accreditationNumber: 'ACC-1'
      },
      {
        name: 'uploaded registered only',
        stored: { accreditationId: null, accreditationNumber: null },
        accreditationNumber: null
      }
    ]

    /**
     * A summary log stored before summary logs dropped their database ids.
     *
     * @param {MongoClient} mongoClient
     * @param {object} accreditation
     */
    const insertWithIds = async (mongoClient, accreditation) => {
      const id = toSummaryLogId(`with-ids-${randomUUID()}`)
      await collection(mongoClient).insertOne(
        /** @type {any} */ ({
          _id: id,
          version: 1,
          ...summaryLogFactory.validating(),
          organisationId: 'org-1',
          registrationId: 'reg-1',
          ...accreditation
        })
      )
      return id
    }

    it('are not stored with a new summary log', async ({
      mongoClient,
      summaryLogsRepository
    }) => {
      const id = toSummaryLogId(`new-${randomUUID()}`)

      await summaryLogsRepository.insert(id, {
        ...summaryLogFactory.validating({ accreditationNumber: 'ACC-1' }),
        organisationId: 'org-1',
        registrationId: 'reg-1',
        accreditationId: 'acc-1'
      })

      const stored = await storedDocument(mongoClient, id)
      expect(stored?.accreditationNumber).toBe('ACC-1')
      expect(databaseIdsIn(stored)).toEqual([])
    })

    for (const shape of OLDER_SHAPES) {
      it(`are not read back from a summary log ${shape.name}, and its accreditation number is`, async ({
        mongoClient,
        summaryLogsRepository
      }) => {
        const id = await insertWithIds(mongoClient, shape.stored)

        const found = await summaryLogsRepository.findById(id)

        expect(found?.summaryLog.status).toBe('validating')
        expect(found?.summaryLog.accreditationNumber).toBe(
          shape.accreditationNumber
        )
        expect(databaseIdsIn(found?.summaryLog)).toEqual([])
      })
    }

    it('are removed from a summary log stored with organisation and registration ids when it is updated', async ({
      mongoClient,
      summaryLogsRepository
    }) => {
      const id = await insertWithIds(mongoClient, {})

      await summaryLogsRepository.update(id, 1, {
        status: 'invalid',
        expiresAt: null
      })

      const stored = await storedDocument(mongoClient, id)
      expect(stored?.status).toBe('invalid')
      expect(stored).not.toHaveProperty('organisationId')
      expect(stored).not.toHaveProperty('registrationId')
    })
  })
})
