import { randomUUID } from 'node:crypto'

const TEST_S3_BUCKET = 'test-bucket'

const buildMinimalSummaryLog = (fileOverrides = {}) => ({
  status: 'validating',
  file: {
    id: 'file-123',
    name: 'test.xlsx',
    s3: {
      bucket: 'bucket',
      key: 'key'
    },
    ...fileOverrides
  }
})

const testInsertBehaviour = (getRepository) => {
  describe('insert', () => {
    const repository = () => getRepository()

    it('inserts a summary log and returns result with insertedId', async () => {
      const fileId = `contract-insert-${randomUUID()}`
      const summaryLog = {
        status: 'validating',
        organisationId: 'org-123',
        registrationId: 'reg-456',
        file: {
          id: fileId,
          name: 'test.xlsx',
          s3: {
            bucket: TEST_S3_BUCKET,
            key: 'test-key'
          }
        }
      }

      const result = await repository().insert(summaryLog)

      expect(result).toHaveProperty('insertedId')
      expect(result.insertedId).toBeTruthy()
    })

    it('stores the summary log so it can be retrieved', async () => {
      const summaryLogId = `contract-retrievable-${randomUUID()}`
      const summaryLog = {
        summaryLogId,
        status: 'validating',
        organisationId: 'org-456',
        registrationId: 'reg-789',
        file: {
          id: `file-${randomUUID()}`,
          name: 'test.xlsx',
          s3: {
            bucket: TEST_S3_BUCKET,
            key: 'test-key'
          }
        }
      }

      await repository().insert(summaryLog)
      const found = await repository().findBySummaryLogId(summaryLogId)

      expect(found).toBeTruthy()
      expect(found.summaryLogId).toBe(summaryLogId)
      expect(found.organisationId).toBe('org-456')
      expect(found.registrationId).toBe('reg-789')
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
        status: 'validating',
        organisationId: 'org-1',
        registrationId: 'reg-1',
        file: {
          id: `file-a-${randomUUID()}`,
          name: 'test.xlsx',
          s3: {
            bucket: 'bucket',
            key: 'key'
          }
        }
      })
      await repository().insert({
        summaryLogId: summaryLogIdB,
        status: 'validating',
        organisationId: 'org-2',
        registrationId: 'reg-2',
        file: {
          id: `file-b-${randomUUID()}`,
          name: 'test.xlsx',
          s3: {
            bucket: 'bucket',
            key: 'key'
          }
        }
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
        status: 'validating',
        file: {
          id: fileId,
          name: 'test.xlsx',
          status: 'complete',
          s3: {
            bucket: TEST_S3_BUCKET,
            key: 'test-key'
          }
        }
      })

      const result = await repository().findBySummaryLogId(summaryLogId)

      expect(result).toBeTruthy()
      expect(result.summaryLogId).toBe(summaryLogId)
      expect(result.file.id).toBe(fileId)
      expect(result.file.name).toBe('test.xlsx')
      expect(result.file.status).toBe('complete')
    })
  })
}

const testInsertValidationRequiredFields = (getRepository) => {
  describe('insert validation - required fields', () => {
    const repository = () => getRepository()

    it('rejects insert with missing file.id', async () => {
      const logWithMissingId = buildMinimalSummaryLog({ id: null })
      await expect(repository().insert(logWithMissingId)).rejects.toThrow(
        /Invalid summary log data.*id/
      )
    })

    it('rejects insert with missing file.name', async () => {
      const logWithMissingName = buildMinimalSummaryLog({ name: null })
      await expect(repository().insert(logWithMissingName)).rejects.toThrow(
        /Invalid summary log data.*name/
      )
    })

    it('rejects insert with missing file.s3.bucket', async () => {
      const logWithMissingBucket = buildMinimalSummaryLog({
        s3: { bucket: null, key: 'key' }
      })
      await expect(repository().insert(logWithMissingBucket)).rejects.toThrow(
        /Invalid summary log data.*bucket/
      )
    })

    it('rejects insert with missing file.s3.key', async () => {
      const logWithMissingKey = buildMinimalSummaryLog({
        s3: { bucket: 'bucket', key: null }
      })
      await expect(repository().insert(logWithMissingKey)).rejects.toThrow(
        /Invalid summary log data.*key/
      )
    })
  })
}

const testInsertValidationFieldRules = (getRepository) => {
  describe('insert validation - field rules', () => {
    const repository = () => getRepository()

    it('rejects insert with invalid file.status', async () => {
      const logWithInvalidStatus = buildMinimalSummaryLog({
        id: `contract-invalid-status-${randomUUID()}`,
        status: 'invalid-status'
      })
      await expect(repository().insert(logWithInvalidStatus)).rejects.toThrow(
        /Invalid summary log data.*status/
      )
    })

    it('strips unknown fields from insert', async () => {
      const summaryLogId = `contract-strip-${randomUUID()}`
      const logWithUnknownFields = {
        summaryLogId,
        ...buildMinimalSummaryLog({
          id: `file-${randomUUID()}`,
          hackerField: 'DROP TABLE users;',
          anotherBadField: 'rm -rf /'
        })
      }

      await repository().insert(logWithUnknownFields)
      const found = await repository().findBySummaryLogId(summaryLogId)

      expect(found.hackerField).toBeUndefined()
      expect(found.anotherBadField).toBeUndefined()
    })

    it('allows optional fields to be omitted', async () => {
      const fileId = `contract-minimal-${randomUUID()}`
      const minimalLog = buildMinimalSummaryLog({ id: fileId })

      const result = await repository().insert(minimalLog)
      expect(result.insertedId).toBeTruthy()
    })

    it('accepts valid file.status values', async () => {
      const completeLog = buildMinimalSummaryLog({
        id: `contract-complete-${randomUUID()}`,
        name: 'complete.xlsx',
        status: 'complete'
      })

      const rejectedLog = buildMinimalSummaryLog({
        id: `contract-rejected-${randomUUID()}`,
        name: 'rejected.xlsx',
        status: 'rejected'
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
    testFindBySummaryLogIdBehaviour(() => repository)
    testInsertValidationRequiredFields(() => repository)
    testInsertValidationFieldRules(() => repository)
  })
}
