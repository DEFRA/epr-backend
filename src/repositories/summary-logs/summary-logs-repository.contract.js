import { randomUUID } from 'node:crypto'

const TEST_S3_BUCKET = 'test-bucket'

const generateFileId = () => `file-${randomUUID()}`

const buildFile = (overrides = {}) => ({
  id: generateFileId(),
  name: 'test.xlsx',
  status: 'complete',
  s3: {
    bucket: TEST_S3_BUCKET,
    key: 'test-key'
  },
  ...overrides
})

const buildPendingFile = (overrides = {}) => {
  const { s3, status, ...rest } = overrides
  return {
    id: generateFileId(),
    name: 'test.xlsx',
    status: 'pending',
    ...rest
  }
}

const buildRejectedFile = (overrides = {}) => {
  const { s3, status, ...rest } = overrides
  return {
    id: generateFileId(),
    name: 'test.xlsx',
    status: 'rejected',
    ...rest
  }
}

const buildSummaryLog = (id, overrides = {}) => {
  const { file, ...logOverrides } = overrides
  return {
    id,
    status: 'validating',
    file: file !== undefined ? file : buildFile(),
    ...logOverrides
  }
}

const testInsertBehaviour = (getRepository) => {
  describe('insert', () => {
    it('inserts a summary log without error', async () => {
      const id = `contract-insert-${randomUUID()}`
      const summaryLog = buildSummaryLog(id, {
        organisationId: 'org-123',
        registrationId: 'reg-456'
      })

      await getRepository().insert(summaryLog)
    })

    it('stores the summary log so it can be retrieved', async () => {
      const id = `contract-retrievable-${randomUUID()}`
      const summaryLog = buildSummaryLog(id, {
        organisationId: 'org-456',
        registrationId: 'reg-789'
      })

      await getRepository().insert(summaryLog)
      const found = await getRepository().findById(id)

      expect(found).toBeTruthy()
      expect(found.id).toBe(id)
      expect(found.organisationId).toBe('org-456')
      expect(found.registrationId).toBe('reg-789')
    })

    it('throws conflict error when inserting duplicate ID', async () => {
      const id = `contract-duplicate-${randomUUID()}`
      const summaryLog = buildSummaryLog(id)

      await getRepository().insert(summaryLog)

      await expect(getRepository().insert(summaryLog)).rejects.toMatchObject({
        isBoom: true,
        output: { statusCode: 409 }
      })
    })

    describe('concurrent insert race conditions', () => {
      // Test environments may not guarantee true concurrency. Implementations must
      // handle real concurrent operations correctly. Passing these tests is necessary
      // but not sufficient proof of correctness.
      it('rejects one of two concurrent inserts with same ID', async () => {
        const id = `contract-concurrent-insert-${randomUUID()}`
        const summaryLogA = buildSummaryLog(id, {
          organisationId: 'org-A',
          file: buildFile({
            name: 'testA.xlsx',
            s3: { bucket: TEST_S3_BUCKET, key: 'test-key-A' }
          })
        })
        const summaryLogB = buildSummaryLog(id, {
          organisationId: 'org-B',
          file: buildFile({
            name: 'testB.xlsx',
            s3: { bucket: TEST_S3_BUCKET, key: 'test-key-B' }
          })
        })

        const results = await Promise.allSettled([
          getRepository().insert(summaryLogA),
          getRepository().insert(summaryLogB)
        ])

        const fulfilled = results.filter((r) => r.status === 'fulfilled')
        const rejected = results.filter((r) => r.status === 'rejected')

        expect(fulfilled).toHaveLength(1)
        expect(rejected).toHaveLength(1)
        expect(rejected[0].reason).toMatchObject({
          isBoom: true,
          output: { statusCode: 409 }
        })

        const final = await getRepository().findById(id)
        expect(final).toBeTruthy()
        expect(final.id).toBe(id)
        expect(['org-A', 'org-B']).toContain(final.organisationId)
      })
    })
  })
}

const testFindById = (getRepository) => {
  describe('findById', () => {
    it('returns null when ID not found', async () => {
      const id = `contract-nonexistent-${randomUUID()}`
      const result = await getRepository().findById(id)

      expect(result).toBeNull()
    })

    it('retrieves a log by ID after insert', async () => {
      const id = `contract-summary-${randomUUID()}`
      const fileId = `contract-file-${randomUUID()}`
      const summaryLog = buildSummaryLog(id, {
        file: buildFile({ id: fileId })
      })

      await getRepository().insert(summaryLog)

      const result = await getRepository().findById(id)

      expect(result).toBeTruthy()
      expect(result.id).toBe(id)
      expect(result.file.id).toBe(fileId)
      expect(result.file.name).toBe('test.xlsx')
      expect(result.file.status).toBe('complete')
    })

    it('does not return logs with different IDs', async () => {
      const idA = `contract-summary-a-${randomUUID()}`
      const idB = `contract-summary-b-${randomUUID()}`

      await getRepository().insert(
        buildSummaryLog(idA, {
          organisationId: 'org-1',
          registrationId: 'reg-1'
        })
      )
      await getRepository().insert(
        buildSummaryLog(idB, {
          organisationId: 'org-2',
          registrationId: 'reg-2'
        })
      )

      const result = await getRepository().findById(idA)

      expect(result.id).toBe(idA)
      expect(result.organisationId).toBe('org-1')
    })
  })
}

const testFindByIdValidation = (getRepository) => {
  describe('findById validation', () => {
    it('rejects null id', async () => {
      await expect(getRepository().findById(null)).rejects.toThrow(/id/)
    })

    it('rejects undefined id', async () => {
      await expect(getRepository().findById(undefined)).rejects.toThrow(/id/)
    })

    it('rejects empty string id', async () => {
      await expect(getRepository().findById('')).rejects.toThrow(/id/)
    })

    it('rejects number id', async () => {
      const invalidNumberId = 123
      await expect(getRepository().findById(invalidNumberId)).rejects.toThrow(
        /id/
      )
    })

    it('rejects object id', async () => {
      await expect(getRepository().findById({})).rejects.toThrow(/id/)
    })
  })
}

const testInsertValidationRequiredFields = (getRepository) => {
  describe('insert validation - required fields', () => {
    it('rejects insert with missing file.id', async () => {
      const id = `contract-validation-${randomUUID()}`
      const logWithMissingId = buildSummaryLog(id, {
        file: buildFile({ id: null })
      })
      await expect(getRepository().insert(logWithMissingId)).rejects.toThrow(
        /Invalid summary log data.*id/
      )
    })

    it('rejects insert with missing file.name', async () => {
      const id = `contract-validation-${randomUUID()}`
      const logWithMissingName = buildSummaryLog(id, {
        file: buildFile({ name: null })
      })
      await expect(getRepository().insert(logWithMissingName)).rejects.toThrow(
        /Invalid summary log data.*name/
      )
    })

    it('rejects insert with missing file.s3.bucket', async () => {
      const id = `contract-validation-${randomUUID()}`
      const logWithMissingBucket = buildSummaryLog(id, {
        file: buildFile({ s3: { bucket: null, key: 'key' } })
      })
      await expect(
        getRepository().insert(logWithMissingBucket)
      ).rejects.toThrow(/Invalid summary log data.*bucket/)
    })

    it('rejects insert with missing file.s3.key', async () => {
      const id = `contract-validation-${randomUUID()}`
      const logWithMissingKey = buildSummaryLog(id, {
        file: buildFile({ s3: { bucket: TEST_S3_BUCKET, key: null } })
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
      const id = `contract-invalid-status-${randomUUID()}`
      const logWithInvalidStatus = buildSummaryLog(id, {
        file: buildFile({ status: 'invalid-status' })
      })
      await expect(
        getRepository().insert(logWithInvalidStatus)
      ).rejects.toThrow(/Invalid summary log data.*status/)
    })

    it('strips unknown fields from insert', async () => {
      const id = `contract-strip-${randomUUID()}`
      const logWithUnknownFields = buildSummaryLog(id, {
        file: buildFile({
          hackerField: 'DROP TABLE users;',
          anotherBadField: 'rm -rf /'
        })
      })

      await getRepository().insert(logWithUnknownFields)
      const found = await getRepository().findById(id)

      expect(found.hackerField).toBeUndefined()
      expect(found.anotherBadField).toBeUndefined()
    })

    it('allows optional fields to be omitted', async () => {
      const id = `contract-minimal-${randomUUID()}`
      const minimalLog = buildSummaryLog(id)

      await getRepository().insert(minimalLog)
    })

    it('accepts valid file.status values', async () => {
      const id1 = `contract-complete-${randomUUID()}`
      const id2 = `contract-rejected-${randomUUID()}`
      const completeLog = buildSummaryLog(id1, {
        file: buildFile({ name: 'complete.xlsx' })
      })
      const rejectedLog = buildSummaryLog(id2, {
        status: 'rejected',
        file: buildRejectedFile({ name: 'rejected.xlsx' })
      })

      await getRepository().insert(completeLog)
      await getRepository().insert(rejectedLog)
    })
  })
}

const testInsertValidationStatusBasedS3 = (getRepository) => {
  describe('insert validation - status-based S3 requirements', () => {
    it('accepts rejected file without S3 info', async () => {
      const id = `contract-rejected-no-s3-${randomUUID()}`
      const rejectedLog = buildSummaryLog(id, {
        status: 'rejected',
        file: buildRejectedFile({ name: 'virus.xlsx' })
      })

      await getRepository().insert(rejectedLog)

      const found = await getRepository().findById(id)
      expect(found.file.status).toBe('rejected')
      expect(found.file.s3).toBeUndefined()
    })

    it('requires S3 info when file status is complete', async () => {
      const id = `contract-complete-no-s3-${randomUUID()}`
      const completeLogWithoutS3 = buildSummaryLog(id, {
        file: {
          id: generateFileId(),
          name: 'test.xlsx',
          status: 'complete'
        }
      })

      await expect(
        getRepository().insert(completeLogWithoutS3)
      ).rejects.toThrow(/Invalid summary log data.*s3/)
    })

    it('accepts pending file without S3 info', async () => {
      const id = `contract-pending-no-s3-${randomUUID()}`
      const pendingLog = buildSummaryLog(id, {
        status: 'preprocessing',
        file: buildPendingFile({ name: 'scanning.xlsx' })
      })

      await getRepository().insert(pendingLog)

      const found = await getRepository().findById(id)
      expect(found.file.status).toBe('pending')
      expect(found.file.s3).toBeUndefined()
    })
  })
}

const testUpdateBehaviour = (getRepository) => {
  describe('update', () => {
    it('updates an existing summary log', async () => {
      const id = `contract-update-${randomUUID()}`
      const summaryLog = buildSummaryLog(id, {
        status: 'preprocessing',
        file: buildPendingFile({ name: 'scanning.xlsx' })
      })

      await getRepository().insert(summaryLog)
      const current = await getRepository().findById(id)

      await getRepository().update(id, current.version, {
        status: 'validating',
        file: buildFile({
          id: summaryLog.file.id,
          name: summaryLog.file.name
        })
      })

      const found = await getRepository().findById(id)
      expect(found.status).toBe('validating')
      expect(found.file.status).toBe('complete')
      expect(found.file.s3.bucket).toBe(TEST_S3_BUCKET)
    })

    it('throws not found error when updating non-existent ID', async () => {
      const id = `contract-nonexistent-${randomUUID()}`

      await expect(
        getRepository().update(id, 1, { status: 'validating' })
      ).rejects.toMatchObject({
        isBoom: true,
        output: { statusCode: 404 }
      })
    })

    it('preserves existing fields not included in update', async () => {
      const id = `contract-preserve-${randomUUID()}`
      const summaryLog = buildSummaryLog(id, {
        status: 'preprocessing',
        organisationId: 'org-123',
        registrationId: 'reg-456',
        file: buildPendingFile()
      })

      await getRepository().insert(summaryLog)
      const current = await getRepository().findById(id)

      await getRepository().update(id, current.version, { status: 'rejected' })

      const found = await getRepository().findById(id)
      expect(found.status).toBe('rejected')
      expect(found.organisationId).toBe('org-123')
      expect(found.registrationId).toBe('reg-456')
    })
  })
}

const testOptimisticConcurrency = (getRepository) => {
  describe('optimistic concurrency control', () => {
    it('initializes version to 1 on insert', async () => {
      const id = `contract-version-init-${randomUUID()}`
      const summaryLog = buildSummaryLog(id)

      await getRepository().insert(summaryLog)
      const found = await getRepository().findById(id)

      expect(found.version).toBe(1)
    })

    it('increments version on successful update', async () => {
      const id = `contract-version-increment-${randomUUID()}`
      const summaryLog = buildSummaryLog(id, {
        status: 'preprocessing',
        file: buildPendingFile()
      })

      await getRepository().insert(summaryLog)
      const initial = await getRepository().findById(id)

      await getRepository().update(id, initial.version, {
        status: 'validating'
      })

      const updated = await getRepository().findById(id)
      expect(updated.version).toBe(2)
      expect(updated.status).toBe('validating')
    })

    it('throws conflict error when updating with stale version', async () => {
      const id = `contract-stale-version-${randomUUID()}`
      const summaryLog = buildSummaryLog(id, {
        status: 'preprocessing',
        file: buildPendingFile()
      })

      await getRepository().insert(summaryLog)
      const initial = await getRepository().findById(id)

      await getRepository().update(id, initial.version, {
        status: 'validating'
      })

      await expect(
        getRepository().update(id, initial.version, { status: 'rejected' })
      ).rejects.toMatchObject({
        isBoom: true,
        output: { statusCode: 409 }
      })
    })

    it('allows sequential updates with correct versions', async () => {
      const id = `contract-sequential-updates-${randomUUID()}`
      const summaryLog = buildSummaryLog(id, {
        status: 'preprocessing',
        file: buildPendingFile()
      })

      await getRepository().insert(summaryLog)

      let current = await getRepository().findById(id)
      expect(current.version).toBe(1)

      await getRepository().update(id, current.version, {
        status: 'validating'
      })
      current = await getRepository().findById(id)
      expect(current.version).toBe(2)

      await getRepository().update(id, current.version, { status: 'validated' })
      current = await getRepository().findById(id)
      expect(current.version).toBe(3)
      expect(current.status).toBe('validated')
    })

    it('preserves version field integrity across updates', async () => {
      const id = `contract-version-integrity-${randomUUID()}`
      const summaryLog = buildSummaryLog(id, {
        status: 'preprocessing',
        organisationId: 'org-123',
        registrationId: 'reg-456',
        file: buildPendingFile()
      })

      await getRepository().insert(summaryLog)
      const initial = await getRepository().findById(id)

      await getRepository().update(id, initial.version, {
        status: 'validating',
        file: buildFile({
          id: initial.file.id,
          name: initial.file.name
        })
      })

      const updated = await getRepository().findById(id)
      expect(updated.version).toBe(2)
      expect(updated.organisationId).toBe('org-123')
      expect(updated.registrationId).toBe('reg-456')
    })

    it('throws conflict with descriptive message for version mismatch', async () => {
      const id = `contract-conflict-message-${randomUUID()}`
      const summaryLog = buildSummaryLog(id, {
        status: 'preprocessing',
        file: buildPendingFile()
      })

      await getRepository().insert(summaryLog)
      const initial = await getRepository().findById(id)

      await getRepository().update(id, initial.version, {
        status: 'validating'
      })

      await expect(
        getRepository().update(id, initial.version, { status: 'rejected' })
      ).rejects.toMatchObject({
        isBoom: true,
        output: {
          statusCode: 409,
          payload: {
            message: expect.stringMatching(
              /version.*conflict|concurrent.*update|stale.*version/i
            )
          }
        }
      })
    })

    describe('concurrent update race conditions', () => {
      // Test environments may not guarantee true concurrency. Implementations must
      // handle real concurrent operations correctly. Passing these tests is necessary
      // but not sufficient proof of correctness.
      it('rejects one of two concurrent updates with same version', async () => {
        const id = `contract-concurrent-${randomUUID()}`
        const summaryLog = buildSummaryLog(id, {
          status: 'preprocessing',
          file: buildPendingFile()
        })

        await getRepository().insert(summaryLog)
        const current = await getRepository().findById(id)

        const results = await Promise.allSettled([
          getRepository().update(id, current.version, { status: 'validating' }),
          getRepository().update(id, current.version, { status: 'rejected' })
        ])

        const fulfilled = results.filter((r) => r.status === 'fulfilled')
        const rejected = results.filter((r) => r.status === 'rejected')

        expect(fulfilled).toHaveLength(1)
        expect(rejected).toHaveLength(1)
        expect(rejected[0].reason).toMatchObject({
          isBoom: true,
          output: { statusCode: 409 }
        })

        const final = await getRepository().findById(id)
        expect(final.version).toBe(2)
        expect(['validating', 'rejected']).toContain(final.status)
      })
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
    testUpdateBehaviour(() => repository)
    testFindById(() => repository)
    testFindByIdValidation(() => repository)
    testInsertValidationRequiredFields(() => repository)
    testInsertValidationFieldHandling(() => repository)
    testInsertValidationStatusBasedS3(() => repository)
    testOptimisticConcurrency(() => repository)
  })
}
