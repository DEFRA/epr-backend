import { randomUUID } from 'node:crypto'
import { describe, expect, it as base } from 'vitest'
import { createMockLogger } from '#test/mock-logger.js'
import { createInMemorySummaryLogsRepository } from './inmemory.js'
import { testSummaryLogsRepositoryContract } from './port.contract.js'
import { summaryLogFactory } from './contract/test-data.js'
import { waitForVersion } from './contract/test-helpers.js'
import { toSummaryLogId } from '#domain/summary-logs/ids.js'

/** @import { SummaryLogsRepository, SummaryLogsRepositoryFactory, SummaryLogVersion } from './port.js' */
/** @import { SummaryLogStore } from './inmemory.js' */
/** @import { InsertStoredSummaryLog } from './contract/test-data.js' */

/**
 * @typedef {object} SummaryLogsFixtures
 * @property {SummaryLogsRepositoryFactory} summaryLogsRepositoryFactory
 * @property {SummaryLogsRepository} summaryLogsRepository
 * @property {SummaryLogStore} summaryLogsStorage
 * @property {InsertStoredSummaryLog} insertStoredSummaryLog
 */

const it = /** @type {import('vitest').TestAPI<SummaryLogsFixtures>} */ (
  base.extend({
    // eslint-disable-next-line no-empty-pattern
    summaryLogsStorage: async ({}, use) => {
      await use(new Map())
    },

    summaryLogsRepositoryFactory: async ({ summaryLogsStorage }, use) => {
      const factory = createInMemorySummaryLogsRepository(summaryLogsStorage)
      await use(factory)
    },

    insertStoredSummaryLog: async ({ summaryLogsStorage }, use) => {
      await use(async (id, summaryLog) => {
        // Holds what the store's type refuses, as the stored data does
        summaryLogsStorage.set(
          id,
          /** @type {SummaryLogVersion} */ (
            /** @type {unknown} */ ({ version: 1, summaryLog })
          )
        )
      })
    },

    summaryLogsRepository: async ({ summaryLogsRepositoryFactory }, use) => {
      const mockLogger = createMockLogger()
      const repository = summaryLogsRepositoryFactory(mockLogger)
      await use(repository)
    }
  })
)

describe('In-memory summary logs repository', () => {
  describe('summary logs repository contract', () => {
    testSummaryLogsRepositoryContract(it)
  })

  describe('data isolation', () => {
    it('returns independent copies that cannot modify stored data', async () => {
      const mockLogger = createMockLogger()
      const repositoryFactory = createInMemorySummaryLogsRepository()
      const repository = repositoryFactory(mockLogger)
      const id = `isolation-test-${randomUUID()}`

      await repository.insert(
        toSummaryLogId(id),
        summaryLogFactory.validating({ file: { name: 'original.xlsx' } })
      )

      const retrieved = await waitForVersion(repository, toSummaryLogId(id), 1)
      retrieved.summaryLog.file.name = 'modified.xlsx'
      retrieved.summaryLog.file.uri = 's3://hacked-bucket/hacked-key'

      const retrievedAgain = await waitForVersion(
        repository,
        toSummaryLogId(id),
        1
      )
      expect(retrievedAgain.summaryLog.file.name).toBe('original.xlsx')
      expect(retrievedAgain.summaryLog.file.uri).toBe(
        's3://test-bucket/test-key'
      )
    })

    it('stores independent copies that cannot be modified by input mutation', async () => {
      const mockLogger = createMockLogger()
      const repositoryFactory = createInMemorySummaryLogsRepository()
      const repository = repositoryFactory(mockLogger)
      const id = `isolation-test-${randomUUID()}`
      const summaryLog = summaryLogFactory.validating({
        file: { name: 'original.xlsx' }
      })

      await repository.insert(toSummaryLogId(id), summaryLog)

      summaryLog.file.name = 'mutated.xlsx'
      summaryLog.file.uri = 's3://mutated-bucket/mutated-key'

      const retrieved = await waitForVersion(repository, toSummaryLogId(id), 1)
      expect(retrieved.summaryLog.file.name).toBe('original.xlsx')
      expect(retrieved.summaryLog.file.uri).toBe('s3://test-bucket/test-key')
    })

    it('stores independent copies on update', async () => {
      const mockLogger = createMockLogger()
      const repositoryFactory = createInMemorySummaryLogsRepository()
      const repository = repositoryFactory(mockLogger)
      const id = `isolation-test-${randomUUID()}`

      await repository.insert(
        toSummaryLogId(id),
        summaryLogFactory.validating()
      )

      // The year, accreditation and numbers are set once at insert time and
      // forbidden on update, so they're excluded here even though the factory
      // sets them.
      const {
        year: _y,
        accreditationId: _a,
        organisationNumber: _o,
        registrationNumber: _r,
        accreditationNumber: _n,
        ...updates
      } = summaryLogFactory.validated({
        file: { name: 'updated.xlsx' }
      })
      await repository.update(toSummaryLogId(id), 1, updates)

      updates.file.name = 'mutated.xlsx'
      updates.file.uri = 's3://evil-bucket/evil-key'

      const retrieved = await waitForVersion(repository, toSummaryLogId(id), 2)
      expect(retrieved.summaryLog.file.name).toBe('updated.xlsx')
      expect(retrieved.summaryLog.file.uri).toBe('s3://test-bucket/test-key')
    })
  })
})
