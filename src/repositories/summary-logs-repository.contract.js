import { randomUUID } from 'node:crypto'

const TEST_S3_BUCKET = 'test-bucket'

const buildMinimalSummaryLog = (fileOverrides = {}) => ({
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
    it('inserts a summary log and returns result with insertedId', async () => {
      const fileId = `contract-insert-${randomUUID()}`
      const summaryLog = {
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

      const result = await getRepository().insert(summaryLog)

      expect(result).toHaveProperty('insertedId')
      expect(result.insertedId).toBeTruthy()
    })

    it('stores the summary log so it can be retrieved', async () => {
      const summaryLogId = `contract-retrievable-${randomUUID()}`
      const summaryLog = {
        summaryLogId,
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

      await getRepository().insert(summaryLog)
      const found = await getRepository().findBySummaryLogId(summaryLogId)

      expect(found).toBeTruthy()
      expect(found.summaryLogId).toBe(summaryLogId)
      expect(found.organisationId).toBe('org-456')
      expect(found.registrationId).toBe('reg-789')
    })
  })
}

const testFindBySummaryLogIdNotFound = (getRepository) => {
  describe('findBySummaryLogId - not found', () => {
    it('returns null when summary log ID not found', async () => {
      const summaryLogId = `contract-nonexistent-${randomUUID()}`
      const result = await getRepository().findBySummaryLogId(summaryLogId)

      expect(result).toBeNull()
    })

    it('does not return logs with different summary log IDs', async () => {
      const summaryLogIdA = `contract-summary-a-${randomUUID()}`
      const summaryLogIdB = `contract-summary-b-${randomUUID()}`

      await getRepository().insert({
        summaryLogId: summaryLogIdA,
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
      await getRepository().insert({
        summaryLogId: summaryLogIdB,
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

      const result = await getRepository().findBySummaryLogId(summaryLogIdA)

      expect(result.summaryLogId).toBe(summaryLogIdA)
      expect(result.organisationId).toBe('org-1')
    })
  })
}

const testFindBySummaryLogIdRetrieval = (getRepository) => {
  describe('findBySummaryLogId - retrieval', () => {
    it('can retrieve a log by summary log ID after insert', async () => {
      const summaryLogId = `contract-summary-${randomUUID()}`
      const fileId = `contract-file-${randomUUID()}`

      await getRepository().insert({
        summaryLogId,
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

      const result = await getRepository().findBySummaryLogId(summaryLogId)

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
    it('rejects insert with missing file.id', async () => {
      const logWithMissingId = buildMinimalSummaryLog({ id: null })
      await expect(getRepository().insert(logWithMissingId)).rejects.toThrow(
        /Invalid summary log data.*id/
      )
    })

    it('rejects insert with missing file.name', async () => {
      const logWithMissingName = buildMinimalSummaryLog({ name: null })
      await expect(getRepository().insert(logWithMissingName)).rejects.toThrow(
        /Invalid summary log data.*name/
      )
    })

    it('rejects insert with missing file.s3.bucket', async () => {
      const logWithMissingBucket = buildMinimalSummaryLog({
        s3: { bucket: null, key: 'key' }
      })
      await expect(
        getRepository().insert(logWithMissingBucket)
      ).rejects.toThrow(/Invalid summary log data.*bucket/)
    })

    it('rejects insert with missing file.s3.key', async () => {
      const logWithMissingKey = buildMinimalSummaryLog({
        s3: { bucket: 'bucket', key: null }
      })
      await expect(getRepository().insert(logWithMissingKey)).rejects.toThrow(
        /Invalid summary log data.*key/
      )
    })
  })
}

const testInsertValidationFieldHandling = (getRepository) => {
  describe('insert validation - field handling', () => {
    it('rejects insert with invalid file.status', async () => {
      const logWithInvalidStatus = buildMinimalSummaryLog({
        id: `contract-invalid-status-${randomUUID()}`,
        status: 'invalid-status'
      })
      await expect(
        getRepository().insert(logWithInvalidStatus)
      ).rejects.toThrow(/Invalid summary log data.*status/)
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

      await getRepository().insert(logWithUnknownFields)
      const found = await getRepository().findBySummaryLogId(summaryLogId)

      expect(found.hackerField).toBeUndefined()
      expect(found.anotherBadField).toBeUndefined()
    })

    it('allows optional fields to be omitted', async () => {
      const fileId = `contract-minimal-${randomUUID()}`
      const minimalLog = buildMinimalSummaryLog({ id: fileId })

      const result = await getRepository().insert(minimalLog)
      expect(result.insertedId).toBeTruthy()
    })

    it('accepts valid file.status values', async () => {
      const completeLog = buildMinimalSummaryLog({
        id: `contract-complete-${randomUUID()}`,
        name: 'complete.xlsx',
        status: 'complete'
      })

      const rejectedLog = {
        file: {
          id: `contract-rejected-${randomUUID()}`,
          name: 'rejected.xlsx',
          status: 'rejected'
        }
      }

      await expect(getRepository().insert(completeLog)).resolves.toHaveProperty(
        'insertedId'
      )
      await expect(getRepository().insert(rejectedLog)).resolves.toHaveProperty(
        'insertedId'
      )
    })
  })
}

const testInsertValidationStatusBasedS3 = (getRepository) => {
  describe('insert validation - status-based S3 requirements', () => {
    it('accepts rejected file without S3 info', async () => {
      const summaryLogId = `contract-rejected-no-s3-${randomUUID()}`
      const rejectedLog = {
        summaryLogId,
        file: {
          id: `file-rejected-${randomUUID()}`,
          name: 'virus.xlsx',
          status: 'rejected'
        }
      }

      const result = await getRepository().insert(rejectedLog)
      expect(result.insertedId).toBeTruthy()

      const found = await getRepository().findBySummaryLogId(summaryLogId)
      expect(found.file.status).toBe('rejected')
      expect(found.file.s3).toBeUndefined()
    })

    it('requires S3 info when file status is complete', async () => {
      const completeLogWithoutS3 = {
        file: {
          id: `contract-complete-no-s3-${randomUUID()}`,
          name: 'test.xlsx',
          status: 'complete'
        }
      }

      await expect(
        getRepository().insert(completeLogWithoutS3)
      ).rejects.toThrow(/Invalid summary log data.*s3/)
    })

    it('accepts pending file without S3 info', async () => {
      const summaryLogId = `contract-pending-no-s3-${randomUUID()}`
      const pendingLog = {
        summaryLogId,
        file: {
          id: `file-pending-${randomUUID()}`,
          name: 'scanning.xlsx',
          status: 'pending'
        }
      }

      const result = await getRepository().insert(pendingLog)
      expect(result.insertedId).toBeTruthy()

      const found = await getRepository().findBySummaryLogId(summaryLogId)
      expect(found.file.status).toBe('pending')
      expect(found.file.s3).toBeUndefined()
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
    testFindBySummaryLogIdNotFound(() => repository)
    testFindBySummaryLogIdRetrieval(() => repository)
    testInsertValidationRequiredFields(() => repository)
    testInsertValidationFieldHandling(() => repository)
    testInsertValidationStatusBasedS3(() => repository)
  })
}
