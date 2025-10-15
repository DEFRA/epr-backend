import { randomUUID } from 'node:crypto'

const TEST_S3_BUCKET = 'test-bucket'

const buildMinimalSummaryLog = (id, fileOverrides = {}) => ({
  id,
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
    it('inserts a summary log without error', async () => {
      const id = `contract-insert-${randomUUID()}`
      const fileId = `file-${randomUUID()}`
      const summaryLog = {
        id,
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

      await getRepository().insert(summaryLog)
    })

    it('stores the summary log so it can be retrieved', async () => {
      const id = `contract-retrievable-${randomUUID()}`
      const summaryLog = {
        id,
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

      await getRepository().insert(summaryLog)
      const found = await getRepository().findById(id)

      expect(found).toBeTruthy()
      expect(found.id).toBe(id)
      expect(found.organisationId).toBe('org-456')
      expect(found.registrationId).toBe('reg-789')
    })

    it('throws conflict error when inserting duplicate ID', async () => {
      const id = `contract-duplicate-${randomUUID()}`
      const summaryLog = {
        id,
        status: 'validating',
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

      await expect(getRepository().insert(summaryLog)).rejects.toMatchObject({
        isBoom: true,
        output: { statusCode: 409 }
      })
    })

    describe('concurrent insert race conditions', () => {
      it('rejects one of two concurrent inserts with same ID', async () => {
        const id = `contract-concurrent-insert-${randomUUID()}`
        const summaryLogA = {
          id,
          status: 'validating',
          organisationId: 'org-A',
          file: {
            id: `file-${randomUUID()}`,
            name: 'testA.xlsx',
            s3: {
              bucket: TEST_S3_BUCKET,
              key: 'test-key-A'
            }
          }
        }
        const summaryLogB = {
          id,
          status: 'validating',
          organisationId: 'org-B',
          file: {
            id: `file-${randomUUID()}`,
            name: 'testB.xlsx',
            s3: {
              bucket: TEST_S3_BUCKET,
              key: 'test-key-B'
            }
          }
        }

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

      await getRepository().insert({
        id,
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

      await getRepository().insert({
        id: idA,
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
      await getRepository().insert({
        id: idB,
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
      const logWithMissingId = buildMinimalSummaryLog(id, { id: null })
      await expect(getRepository().insert(logWithMissingId)).rejects.toThrow(
        /Invalid summary log data.*id/
      )
    })

    it('rejects insert with missing file.name', async () => {
      const id = `contract-validation-${randomUUID()}`
      const logWithMissingName = buildMinimalSummaryLog(id, { name: null })
      await expect(getRepository().insert(logWithMissingName)).rejects.toThrow(
        /Invalid summary log data.*name/
      )
    })

    it('rejects insert with missing file.s3.bucket', async () => {
      const id = `contract-validation-${randomUUID()}`
      const logWithMissingBucket = buildMinimalSummaryLog(id, {
        s3: { bucket: null, key: 'key' }
      })
      await expect(
        getRepository().insert(logWithMissingBucket)
      ).rejects.toThrow(/Invalid summary log data.*bucket/)
    })

    it('rejects insert with missing file.s3.key', async () => {
      const id = `contract-validation-${randomUUID()}`
      const logWithMissingKey = buildMinimalSummaryLog(id, {
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
      const id = `contract-invalid-status-${randomUUID()}`
      const logWithInvalidStatus = buildMinimalSummaryLog(id, {
        id: `file-${randomUUID()}`,
        status: 'invalid-status'
      })
      await expect(
        getRepository().insert(logWithInvalidStatus)
      ).rejects.toThrow(/Invalid summary log data.*status/)
    })

    it('strips unknown fields from insert', async () => {
      const id = `contract-strip-${randomUUID()}`
      const logWithUnknownFields = {
        ...buildMinimalSummaryLog(id, {
          id: `file-${randomUUID()}`,
          hackerField: 'DROP TABLE users;',
          anotherBadField: 'rm -rf /'
        })
      }

      await getRepository().insert(logWithUnknownFields)
      const found = await getRepository().findById(id)

      expect(found.hackerField).toBeUndefined()
      expect(found.anotherBadField).toBeUndefined()
    })

    it('allows optional fields to be omitted', async () => {
      const id = `contract-minimal-${randomUUID()}`
      const fileId = `file-${randomUUID()}`
      const minimalLog = buildMinimalSummaryLog(id, { id: fileId })

      await getRepository().insert(minimalLog)
    })

    it('accepts valid file.status values', async () => {
      const id1 = `contract-complete-${randomUUID()}`
      const id2 = `contract-rejected-${randomUUID()}`
      const completeLog = buildMinimalSummaryLog(id1, {
        id: `file-${randomUUID()}`,
        name: 'complete.xlsx',
        status: 'complete'
      })

      const rejectedLog = {
        id: id2,
        status: 'rejected',
        file: {
          id: `file-${randomUUID()}`,
          name: 'rejected.xlsx',
          status: 'rejected'
        }
      }

      await getRepository().insert(completeLog)
      await getRepository().insert(rejectedLog)
    })
  })
}

const testInsertValidationStatusBasedS3 = (getRepository) => {
  describe('insert validation - status-based S3 requirements', () => {
    it('accepts rejected file without S3 info', async () => {
      const id = `contract-rejected-no-s3-${randomUUID()}`
      const rejectedLog = {
        id,
        status: 'rejected',
        file: {
          id: `file-rejected-${randomUUID()}`,
          name: 'virus.xlsx',
          status: 'rejected'
        }
      }

      await getRepository().insert(rejectedLog)

      const found = await getRepository().findById(id)
      expect(found.file.status).toBe('rejected')
      expect(found.file.s3).toBeUndefined()
    })

    it('requires S3 info when file status is complete', async () => {
      const id = `contract-complete-no-s3-${randomUUID()}`
      const completeLogWithoutS3 = {
        id,
        status: 'validating',
        file: {
          id: `file-${randomUUID()}`,
          name: 'test.xlsx',
          status: 'complete'
        }
      }

      await expect(
        getRepository().insert(completeLogWithoutS3)
      ).rejects.toThrow(/Invalid summary log data.*s3/)
    })

    it('accepts pending file without S3 info', async () => {
      const id = `contract-pending-no-s3-${randomUUID()}`
      const pendingLog = {
        id,
        status: 'preprocessing',
        file: {
          id: `file-pending-${randomUUID()}`,
          name: 'scanning.xlsx',
          status: 'pending'
        }
      }

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
      const summaryLog = {
        id,
        status: 'preprocessing',
        file: {
          id: `file-${randomUUID()}`,
          name: 'scanning.xlsx',
          status: 'pending'
        }
      }

      await getRepository().insert(summaryLog)
      const current = await getRepository().findById(id)

      await getRepository().update(id, current.version, {
        status: 'validating',
        file: {
          id: summaryLog.file.id,
          name: summaryLog.file.name,
          status: 'complete',
          s3: {
            bucket: TEST_S3_BUCKET,
            key: 'test-key'
          }
        }
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
      const summaryLog = {
        id,
        status: 'preprocessing',
        organisationId: 'org-123',
        registrationId: 'reg-456',
        file: {
          id: `file-${randomUUID()}`,
          name: 'test.xlsx',
          status: 'pending'
        }
      }

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
      const summaryLog = {
        id,
        status: 'validating',
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
      const found = await getRepository().findById(id)

      expect(found.version).toBe(1)
    })

    it('increments version on successful update', async () => {
      const id = `contract-version-increment-${randomUUID()}`
      const summaryLog = {
        id,
        status: 'preprocessing',
        file: {
          id: `file-${randomUUID()}`,
          name: 'test.xlsx',
          status: 'pending'
        }
      }

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
      const summaryLog = {
        id,
        status: 'preprocessing',
        file: {
          id: `file-${randomUUID()}`,
          name: 'test.xlsx',
          status: 'pending'
        }
      }

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
      const summaryLog = {
        id,
        status: 'preprocessing',
        file: {
          id: `file-${randomUUID()}`,
          name: 'test.xlsx',
          status: 'pending'
        }
      }

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
      const summaryLog = {
        id,
        status: 'preprocessing',
        organisationId: 'org-123',
        registrationId: 'reg-456',
        file: {
          id: `file-${randomUUID()}`,
          name: 'test.xlsx',
          status: 'pending'
        }
      }

      await getRepository().insert(summaryLog)
      const initial = await getRepository().findById(id)

      await getRepository().update(id, initial.version, {
        status: 'validating',
        file: {
          ...initial.file,
          status: 'complete',
          s3: {
            bucket: TEST_S3_BUCKET,
            key: 'test-key'
          }
        }
      })

      const updated = await getRepository().findById(id)
      expect(updated.version).toBe(2)
      expect(updated.organisationId).toBe('org-123')
      expect(updated.registrationId).toBe('reg-456')
    })

    it('throws conflict with descriptive message for version mismatch', async () => {
      const id = `contract-conflict-message-${randomUUID()}`
      const summaryLog = {
        id,
        status: 'preprocessing',
        file: {
          id: `file-${randomUUID()}`,
          name: 'test.xlsx',
          status: 'pending'
        }
      }

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
      it('rejects one of two concurrent updates with same version', async () => {
        const id = `contract-concurrent-${randomUUID()}`
        const summaryLog = {
          id,
          status: 'preprocessing',
          file: {
            id: `file-${randomUUID()}`,
            name: 'test.xlsx',
            status: 'pending'
          }
        }

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
