import { createInMemorySummaryLogsRepository } from './summary-logs-repository.inmemory.js'

describe('createInMemorySummaryLogsRepository', () => {
  let repository

  beforeEach(() => {
    repository = createInMemorySummaryLogsRepository()
  })

  describe('insert', () => {
    it('inserts a summary log and returns inserted ID', async () => {
      const summaryLog = {
        fileId: 'test-file-id',
        organisationId: 'org-123',
        registrationId: 'reg-456'
      }

      const result = await repository.insert(summaryLog)

      expect(result).toHaveProperty('insertedId')
      expect(typeof result.insertedId).toBe('string')
    })

    it('stores the summary log with _id', async () => {
      const summaryLog = {
        fileId: 'test-file-id',
        data: 'test-data'
      }

      const result = await repository.insert(summaryLog)
      const found = await repository.findByFileId('test-file-id')

      expect(found).toEqual({
        ...summaryLog,
        _id: result.insertedId
      })
    })
  })

  describe('findByFileId', () => {
    it('finds a summary log by file ID', async () => {
      const summaryLog = {
        fileId: 'test-file-id',
        data: 'test-data'
      }

      await repository.insert(summaryLog)
      const result = await repository.findByFileId('test-file-id')

      expect(result).toMatchObject(summaryLog)
    })

    it('returns null when file ID not found', async () => {
      const result = await repository.findByFileId('non-existent')

      expect(result).toBeNull()
    })
  })

  describe('findByOrganisationAndRegistration', () => {
    it('finds summary logs by organisation and registration IDs', async () => {
      const log1 = {
        fileId: 'file-1',
        organisationId: 'org-123',
        registrationId: 'reg-456'
      }
      const log2 = {
        fileId: 'file-2',
        organisationId: 'org-123',
        registrationId: 'reg-456'
      }
      const log3 = {
        fileId: 'file-3',
        organisationId: 'org-999',
        registrationId: 'reg-999'
      }

      await repository.insert(log1)
      await repository.insert(log2)
      await repository.insert(log3)

      const results = await repository.findByOrganisationAndRegistration(
        'org-123',
        'reg-456'
      )

      expect(results).toHaveLength(2)
      expect(results[0]).toMatchObject(log1)
      expect(results[1]).toMatchObject(log2)
    })

    it('returns empty array when no matches found', async () => {
      const results = await repository.findByOrganisationAndRegistration(
        'org-999',
        'reg-999'
      )

      expect(results).toEqual([])
    })
  })

  describe('clear', () => {
    it('removes all summary logs', async () => {
      await repository.insert({ fileId: 'file-1' })
      await repository.insert({ fileId: 'file-2' })

      repository.clear()

      const result1 = await repository.findByFileId('file-1')
      const result2 = await repository.findByFileId('file-2')

      expect(result1).toBeNull()
      expect(result2).toBeNull()
    })
  })
})
