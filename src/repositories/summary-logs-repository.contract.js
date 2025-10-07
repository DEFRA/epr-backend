import { randomUUID } from 'node:crypto'

const TEST_S3_BUCKET = 'test-bucket'

const buildTestInvalidLog = (overrides = {}) => ({
  fileId: 'file-123',
  filename: 'test.xlsx',
  s3Bucket: 'bucket',
  s3Key: 'key',
  ...overrides
})

const testInsertBehaviour = (getRepository) => {
  describe('insert', () => {
    const repository = () => getRepository()

    it('inserts a summary log and returns result with insertedId', async () => {
      const fileId = `contract-insert-${randomUUID()}`
      const summaryLog = {
        fileId,
        organisationId: 'org-123',
        registrationId: 'reg-456',
        filename: 'test.xlsx',
        s3Bucket: TEST_S3_BUCKET,
        s3Key: 'test-key'
      }

      const result = await repository().insert(summaryLog)

      expect(result).toHaveProperty('insertedId')
      expect(result.insertedId).toBeTruthy()
    })

    it('stores the summary log so it can be retrieved', async () => {
      const fileId = `contract-retrievable-${randomUUID()}`
      const summaryLog = {
        fileId,
        filename: 'test.xlsx',
        s3Bucket: TEST_S3_BUCKET,
        s3Key: 'test-key',
        organisationId: 'org-456',
        registrationId: 'reg-789'
      }

      await repository().insert(summaryLog)
      const found = await repository().findByFileId(fileId)

      expect(found).toBeTruthy()
      expect(found.fileId).toBe(fileId)
      expect(found.organisationId).toBe('org-456')
      expect(found.registrationId).toBe('reg-789')
    })
  })
}

const testFindByFileIdBehaviour = (getRepository) => {
  describe('findByFileId', () => {
    const repository = () => getRepository()

    it('returns null when file ID not found', async () => {
      const fileId = `contract-nonexistent-${randomUUID()}`
      const result = await repository().findByFileId(fileId)

      expect(result).toBeNull()
    })

    it('does not return logs with different file IDs', async () => {
      const fileIdA = `contract-file-a-${randomUUID()}`
      const fileIdB = `contract-file-b-${randomUUID()}`

      await repository().insert({
        fileId: fileIdA,
        filename: 'test-a.xlsx',
        s3Bucket: 'bucket',
        s3Key: 'key-a',
        organisationId: 'org-1',
        registrationId: 'reg-1'
      })
      await repository().insert({
        fileId: fileIdB,
        filename: 'test-b.xlsx',
        s3Bucket: 'bucket',
        s3Key: 'key-b',
        organisationId: 'org-2',
        registrationId: 'reg-2'
      })

      const result = await repository().findByFileId(fileIdA)

      expect(result.fileId).toBe(fileIdA)
      expect(result.organisationId).toBe('org-1')
    })
  })
}

const testFindBySummaryLogIdBehaviour = (getRepository) => {
  describe('findBySummaryLogId', () => {
    const repository = () => getRepository()

    it('returns null when summary log ID not found', async () => {
      const summaryLogId = `contract-nonexistent-${randomUUID()}`
      const result = await repository().findBySummaryLogId(summaryLogId)

      expect(result).toBeNull()
    })

    it('does not return logs with different summary log IDs', async () => {
      const summaryLogIdA = `contract-summary-a-${randomUUID()}`
      const summaryLogIdB = `contract-summary-b-${randomUUID()}`

      await repository().insert({
        summaryLogId: summaryLogIdA,
        fileId: `file-a-${randomUUID()}`,
        filename: 'test.xlsx',
        s3Bucket: 'bucket',
        s3Key: 'key',
        organisationId: 'org-1',
        registrationId: 'reg-1'
      })
      await repository().insert({
        summaryLogId: summaryLogIdB,
        fileId: `file-b-${randomUUID()}`,
        filename: 'test.xlsx',
        s3Bucket: 'bucket',
        s3Key: 'key',
        organisationId: 'org-2',
        registrationId: 'reg-2'
      })

      const result = await repository().findBySummaryLogId(summaryLogIdA)

      expect(result.summaryLogId).toBe(summaryLogIdA)
      expect(result.organisationId).toBe('org-1')
    })

    it('can retrieve a log by summary log ID after insert', async () => {
      const summaryLogId = `contract-summary-${randomUUID()}`
      const fileId = `contract-file-${randomUUID()}`

      await repository().insert({
        summaryLogId,
        fileId,
        filename: 'test.xlsx',
        fileStatus: 'complete',
        s3Bucket: TEST_S3_BUCKET,
        s3Key: 'test-key'
      })

      const result = await repository().findBySummaryLogId(summaryLogId)

      expect(result).toBeTruthy()
      expect(result.summaryLogId).toBe(summaryLogId)
      expect(result.fileId).toBe(fileId)
      expect(result.filename).toBe('test.xlsx')
      expect(result.fileStatus).toBe('complete')
    })
  })
}

const testInsertValidationRequiredFields = (getRepository) => {
  describe('insert validation - required fields', () => {
    const repository = () => getRepository()

    it('rejects insert with missing fileId', async () => {
      const invalidLog = buildTestInvalidLog({ fileId: null })
      await expect(repository().insert(invalidLog)).rejects.toThrow(
        /Invalid summary log data.*fileId/
      )
    })

    it('rejects insert with missing filename', async () => {
      const invalidLog = buildTestInvalidLog({ filename: null })
      await expect(repository().insert(invalidLog)).rejects.toThrow(
        /Invalid summary log data.*filename/
      )
    })

    it('rejects insert with missing s3Bucket', async () => {
      const invalidLog = buildTestInvalidLog({ s3Bucket: null })
      await expect(repository().insert(invalidLog)).rejects.toThrow(
        /Invalid summary log data.*s3Bucket/
      )
    })

    it('rejects insert with missing s3Key', async () => {
      const invalidLog = buildTestInvalidLog({ s3Key: null })
      await expect(repository().insert(invalidLog)).rejects.toThrow(
        /Invalid summary log data.*s3Key/
      )
    })
  })
}

const testInsertValidationFieldRules = (getRepository) => {
  describe('insert validation - field rules', () => {
    const repository = () => getRepository()

    it('rejects insert with invalid fileStatus', async () => {
      const invalidLog = buildTestInvalidLog({
        fileId: `contract-invalid-status-${randomUUID()}`,
        fileStatus: 'completely-shagged'
      })
      await expect(repository().insert(invalidLog)).rejects.toThrow(
        /Invalid summary log data.*fileStatus/
      )
    })

    it('strips unknown fields from insert', async () => {
      const fileId = `contract-strip-${randomUUID()}`
      const logWithExtra = buildTestInvalidLog({
        fileId,
        hackerField: 'DROP TABLE users;',
        anotherBadField: 'rm -rf /'
      })

      await repository().insert(logWithExtra)
      const found = await repository().findByFileId(fileId)

      expect(found.hackerField).toBeUndefined()
      expect(found.anotherBadField).toBeUndefined()
    })

    it('allows optional fields to be omitted', async () => {
      const fileId = `contract-minimal-${randomUUID()}`
      const minimalLog = buildTestInvalidLog({ fileId })

      const result = await repository().insert(minimalLog)
      expect(result.insertedId).toBeTruthy()
    })

    it('accepts valid fileStatus values', async () => {
      const completeLog = buildTestInvalidLog({
        fileId: `contract-complete-${randomUUID()}`,
        filename: 'complete.xlsx',
        fileStatus: 'complete'
      })

      const rejectedLog = buildTestInvalidLog({
        fileId: `contract-rejected-${randomUUID()}`,
        filename: 'rejected.xlsx',
        fileStatus: 'rejected'
      })

      await expect(repository().insert(completeLog)).resolves.toHaveProperty(
        'insertedId'
      )
      await expect(repository().insert(rejectedLog)).resolves.toHaveProperty(
        'insertedId'
      )
    })
  })
}

export const testSummaryLogsRepositoryContract = (createRepository) => {
  describe('summary logs repository contract', () => {
    let repository

    beforeEach(async () => {
      repository = await createRepository()
    })

    testInsertBehaviour(() => repository)
    testFindByFileIdBehaviour(() => repository)
    testFindBySummaryLogIdBehaviour(() => repository)
    testInsertValidationRequiredFields(() => repository)
    testInsertValidationFieldRules(() => repository)
  })
}
