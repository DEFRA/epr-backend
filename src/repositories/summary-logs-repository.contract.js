export const summaryLogsRepositoryContract = (createRepository) => {
  describe('summary logs repository contract', () => {
    let repository

    beforeEach(async () => {
      repository = await createRepository()
      if (repository.clear) {
        await repository.clear()
      }
    })

    describe('insert', () => {
      it('inserts a summary log and returns result with insertedId', async () => {
        const summaryLog = {
          fileId: 'test-file-id',
          organisationId: 'org-123',
          registrationId: 'reg-456',
          filename: 'test.xlsx',
          s3Bucket: 'test-bucket',
          s3Key: 'test-key'
        }

        const result = await repository.insert(summaryLog)

        expect(result).toHaveProperty('insertedId')
        expect(result.insertedId).toBeTruthy()
      })

      it('stores the summary log so it can be retrieved', async () => {
        const summaryLog = {
          fileId: 'retrievable-file-id',
          organisationId: 'org-456',
          registrationId: 'reg-789',
          data: 'test-data'
        }

        await repository.insert(summaryLog)
        const found = await repository.findByFileId('retrievable-file-id')

        expect(found).toBeTruthy()
        expect(found.fileId).toBe('retrievable-file-id')
        expect(found.organisationId).toBe('org-456')
        expect(found.registrationId).toBe('reg-789')
        expect(found.data).toBe('test-data')
      })
    })

    describe('findByFileId', () => {
      it('finds a summary log by file ID', async () => {
        const summaryLog = {
          fileId: 'searchable-file-id',
          organisationId: 'org-search',
          registrationId: 'reg-search',
          metadata: { test: 'value' }
        }

        await repository.insert(summaryLog)
        const result = await repository.findByFileId('searchable-file-id')

        expect(result).toBeTruthy()
        expect(result.fileId).toBe('searchable-file-id')
        expect(result.organisationId).toBe('org-search')
        expect(result.registrationId).toBe('reg-search')
        expect(result.metadata).toEqual({ test: 'value' })
      })

      it('returns null when file ID not found', async () => {
        const result = await repository.findByFileId('non-existent-file-id')

        expect(result).toBeNull()
      })

      it('does not return logs with different file IDs', async () => {
        await repository.insert({
          fileId: 'file-a',
          organisationId: 'org-1',
          registrationId: 'reg-1'
        })
        await repository.insert({
          fileId: 'file-b',
          organisationId: 'org-2',
          registrationId: 'reg-2'
        })

        const result = await repository.findByFileId('file-a')

        expect(result.fileId).toBe('file-a')
        expect(result.organisationId).toBe('org-1')
      })
    })
  })
}
