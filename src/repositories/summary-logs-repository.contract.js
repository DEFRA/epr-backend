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

    describe('findByOrganisationAndRegistration', () => {
      it('finds all summary logs for an organisation and registration', async () => {
        const log1 = {
          fileId: 'file-1',
          organisationId: 'org-contract',
          registrationId: 'reg-contract',
          filename: 'file1.xlsx'
        }
        const log2 = {
          fileId: 'file-2',
          organisationId: 'org-contract',
          registrationId: 'reg-contract',
          filename: 'file2.xlsx'
        }
        const log3 = {
          fileId: 'file-3',
          organisationId: 'org-other',
          registrationId: 'reg-other',
          filename: 'file3.xlsx'
        }

        await repository.insert(log1)
        await repository.insert(log2)
        await repository.insert(log3)

        const results = await repository.findByOrganisationAndRegistration(
          'org-contract',
          'reg-contract'
        )

        expect(results).toHaveLength(2)
        expect(results.map((r) => r.fileId).sort()).toEqual([
          'file-1',
          'file-2'
        ])
      })

      it('returns empty array when no matches found', async () => {
        await repository.insert({
          fileId: 'file-x',
          organisationId: 'org-x',
          registrationId: 'reg-x'
        })

        const results = await repository.findByOrganisationAndRegistration(
          'org-nonexistent',
          'reg-nonexistent'
        )

        expect(results).toEqual([])
      })

      it('filters by both organisation and registration ID', async () => {
        await repository.insert({
          fileId: 'file-match',
          organisationId: 'org-filter',
          registrationId: 'reg-filter'
        })
        await repository.insert({
          fileId: 'file-wrong-org',
          organisationId: 'org-different',
          registrationId: 'reg-filter'
        })
        await repository.insert({
          fileId: 'file-wrong-reg',
          organisationId: 'org-filter',
          registrationId: 'reg-different'
        })

        const results = await repository.findByOrganisationAndRegistration(
          'org-filter',
          'reg-filter'
        )

        expect(results).toHaveLength(1)
        expect(results[0].fileId).toBe('file-match')
      })

      it('returns empty array when organisation exists but registration does not', async () => {
        await repository.insert({
          fileId: 'file-org-only',
          organisationId: 'org-exists',
          registrationId: 'reg-exists'
        })

        const results = await repository.findByOrganisationAndRegistration(
          'org-exists',
          'reg-not-exists'
        )

        expect(results).toEqual([])
      })
    })
  })
}
