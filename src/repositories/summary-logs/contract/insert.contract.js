import { randomUUID } from 'node:crypto'
import {
  TEST_S3_BUCKET,
  generateFileId,
  buildFile,
  buildPendingFile,
  buildRejectedFile,
  buildSummaryLog
} from './test-data.js'

export const testInsertBehaviour = (getRepository) => {
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

export const testInsertValidationRequiredFields = (getRepository) => {
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

export const testInsertValidationFieldHandling = (getRepository) => {
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

export const testInsertValidationStatusBasedS3 = (getRepository) => {
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
