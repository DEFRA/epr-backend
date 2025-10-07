import { randomUUID } from 'node:crypto'

export const testSummaryLogsRepositoryContract = (createRepository) => {
  describe('summary logs repository contract', () => {
    let repository

    beforeEach(async () => {
      repository = await createRepository()
    })

    describe('insert', () => {
      it('inserts a summary log and returns result with insertedId', async () => {
        const fileId = `contract-insert-${randomUUID()}`
        const summaryLog = {
          fileId,
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
        const fileId = `contract-retrievable-${randomUUID()}`
        const summaryLog = {
          fileId,
          organisationId: 'org-456',
          registrationId: 'reg-789',
          data: 'test-data'
        }

        await repository.insert(summaryLog)
        const found = await repository.findByFileId(fileId)

        expect(found).toBeTruthy()
        expect(found.fileId).toBe(fileId)
        expect(found.organisationId).toBe('org-456')
        expect(found.registrationId).toBe('reg-789')
        expect(found.data).toBe('test-data')
      })
    })

    describe('findByFileId', () => {
      it('returns null when file ID not found', async () => {
        const fileId = `contract-nonexistent-${randomUUID()}`
        const result = await repository.findByFileId(fileId)

        expect(result).toBeNull()
      })

      it('does not return logs with different file IDs', async () => {
        const fileIdA = `contract-file-a-${randomUUID()}`
        const fileIdB = `contract-file-b-${randomUUID()}`

        await repository.insert({
          fileId: fileIdA,
          organisationId: 'org-1',
          registrationId: 'reg-1'
        })
        await repository.insert({
          fileId: fileIdB,
          organisationId: 'org-2',
          registrationId: 'reg-2'
        })

        const result = await repository.findByFileId(fileIdA)

        expect(result.fileId).toBe(fileIdA)
        expect(result.organisationId).toBe('org-1')
      })
    })

    describe('findBySummaryLogId', () => {
      it('returns null when summary log ID not found', async () => {
        const summaryLogId = `contract-nonexistent-${randomUUID()}`
        const result = await repository.findBySummaryLogId(summaryLogId)

        expect(result).toBeNull()
      })

      it('does not return logs with different summary log IDs', async () => {
        const summaryLogIdA = `contract-summary-a-${randomUUID()}`
        const summaryLogIdB = `contract-summary-b-${randomUUID()}`

        await repository.insert({
          summaryLogId: summaryLogIdA,
          fileId: `file-a-${randomUUID()}`,
          organisationId: 'org-1',
          registrationId: 'reg-1'
        })
        await repository.insert({
          summaryLogId: summaryLogIdB,
          fileId: `file-b-${randomUUID()}`,
          organisationId: 'org-2',
          registrationId: 'reg-2'
        })

        const result = await repository.findBySummaryLogId(summaryLogIdA)

        expect(result.summaryLogId).toBe(summaryLogIdA)
        expect(result.organisationId).toBe('org-1')
      })

      it('can retrieve a log by summary log ID after insert', async () => {
        const summaryLogId = `contract-summary-${randomUUID()}`
        const fileId = `contract-file-${randomUUID()}`

        await repository.insert({
          summaryLogId,
          fileId,
          filename: 'test.xlsx',
          fileStatus: 'complete',
          s3Bucket: 'test-bucket',
          s3Key: 'test-key'
        })

        const result = await repository.findBySummaryLogId(summaryLogId)

        expect(result).toBeTruthy()
        expect(result.summaryLogId).toBe(summaryLogId)
        expect(result.fileId).toBe(fileId)
        expect(result.filename).toBe('test.xlsx')
        expect(result.fileStatus).toBe('complete')
      })
    })
  })
}
