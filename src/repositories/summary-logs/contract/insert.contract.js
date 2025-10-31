import { describe, beforeEach } from 'vitest'
import { randomUUID } from 'node:crypto'
import {
  TEST_S3_BUCKET,
  generateFileId,
  buildFile,
  buildPendingFile,
  buildRejectedFile,
  buildSummaryLog
} from './test-data.js'

export const testInsertBehaviour = (it) => {
  describe('insert', () => {
    let repository

    beforeEach(async ({ summaryLogsRepository }) => {
      repository = summaryLogsRepository
    })

    describe('basic behaviour', () => {
      it('inserts a summary log without error', async () => {
        const id = `contract-insert-${randomUUID()}`
        const summaryLog = buildSummaryLog({
          organisationId: 'org-123',
          registrationId: 'reg-456'
        })

        await repository.insert(id, summaryLog)
      })

      it('stores the summary log so it can be retrieved', async () => {
        const id = `contract-retrievable-${randomUUID()}`
        const summaryLog = buildSummaryLog({
          organisationId: 'org-456',
          registrationId: 'reg-789'
        })

        await repository.insert(id, summaryLog)
        const found = await repository.findById(id)

        expect(found).toBeTruthy()
        expect(found.summaryLog.organisationId).toBe('org-456')
        expect(found.summaryLog.registrationId).toBe('reg-789')
      })

      it('throws conflict error when inserting duplicate ID', async () => {
        const id = `contract-duplicate-${randomUUID()}`
        const summaryLog = buildSummaryLog()

        await repository.insert(id, summaryLog)

        await expect(repository.insert(id, summaryLog)).rejects.toMatchObject({
          isBoom: true,
          output: { statusCode: 409 }
        })
      })
    })

    describe('concurrent insert race conditions', () => {
      it('rejects one of two concurrent inserts with same ID', async () => {
        const id = `contract-concurrent-insert-${randomUUID()}`
        const summaryLogA = buildSummaryLog({
          organisationId: 'org-A',
          file: buildFile({
            name: 'testA.xlsx',
            s3: { bucket: TEST_S3_BUCKET, key: 'test-key-A' }
          })
        })
        const summaryLogB = buildSummaryLog({
          organisationId: 'org-B',
          file: buildFile({
            name: 'testB.xlsx',
            s3: { bucket: TEST_S3_BUCKET, key: 'test-key-B' }
          })
        })

        const results = await Promise.allSettled([
          repository.insert(id, summaryLogA),
          repository.insert(id, summaryLogB)
        ])

        const fulfilled = results.filter((r) => r.status === 'fulfilled')
        const rejected = results.filter((r) => r.status === 'rejected')

        expect(fulfilled).toHaveLength(1)
        expect(rejected).toHaveLength(1)
        expect(rejected[0].reason).toMatchObject({
          isBoom: true,
          output: { statusCode: 409 }
        })

        const final = await repository.findById(id)
        expect(final).toBeTruthy()
        expect(['org-A', 'org-B']).toContain(final.summaryLog.organisationId)
      })
    })

    describe('validation', () => {
      describe('required fields', () => {
        it('rejects insert with missing file.id', async () => {
          const id = `contract-validation-${randomUUID()}`
          const logWithMissingId = buildSummaryLog({
            file: buildFile({ id: null })
          })
          await expect(repository.insert(id, logWithMissingId)).rejects.toThrow(
            /Invalid summary log data.*id/
          )
        })

        it('rejects insert with missing file.name', async () => {
          const id = `contract-validation-${randomUUID()}`
          const logWithMissingName = buildSummaryLog({
            file: buildFile({ name: null })
          })
          await expect(
            repository.insert(id, logWithMissingName)
          ).rejects.toThrow(/Invalid summary log data.*name/)
        })

        it('rejects insert with missing file.s3.bucket', async () => {
          const id = `contract-validation-${randomUUID()}`
          const logWithMissingBucket = buildSummaryLog({
            file: buildFile({ s3: { bucket: null, key: 'key' } })
          })
          await expect(
            repository.insert(id, logWithMissingBucket)
          ).rejects.toThrow(/Invalid summary log data.*bucket/)
        })

        it('rejects insert with missing file.s3.key', async () => {
          const id = `contract-validation-${randomUUID()}`
          const logWithMissingKey = buildSummaryLog({
            file: buildFile({ s3: { bucket: TEST_S3_BUCKET, key: null } })
          })
          await expect(
            repository.insert(id, logWithMissingKey)
          ).rejects.toThrow(/Invalid summary log data.*key/)
        })
      })

      describe('field handling', () => {
        it('rejects insert with invalid file.status', async () => {
          const id = `contract-invalid-status-${randomUUID()}`
          const logWithInvalidStatus = buildSummaryLog({
            file: buildFile({ status: 'invalid-status' })
          })
          await expect(
            repository.insert(id, logWithInvalidStatus)
          ).rejects.toThrow(/Invalid summary log data.*status/)
        })

        it('strips unknown fields from insert', async () => {
          const id = `contract-strip-${randomUUID()}`
          const logWithUnknownFields = buildSummaryLog({
            file: buildFile({
              hackerField: 'DROP TABLE users;',
              anotherBadField: 'rm -rf /'
            })
          })

          await repository.insert(id, logWithUnknownFields)
          const found = await repository.findById(id)

          expect(found.summaryLog.hackerField).toBeUndefined()
          expect(found.summaryLog.anotherBadField).toBeUndefined()
        })

        it('allows optional fields to be omitted', async () => {
          const id = `contract-minimal-${randomUUID()}`
          const minimalLog = buildSummaryLog()

          await repository.insert(id, minimalLog)
        })

        it('accepts valid file.status values', async () => {
          const id1 = `contract-complete-${randomUUID()}`
          const id2 = `contract-rejected-${randomUUID()}`
          const completeLog = buildSummaryLog({
            file: buildFile({ name: 'complete.xlsx' })
          })
          const rejectedLog = buildSummaryLog({
            status: 'rejected',
            file: buildRejectedFile({ name: 'rejected.xlsx' })
          })

          await repository.insert(id1, completeLog)
          await repository.insert(id2, rejectedLog)
        })
      })

      describe('status-based S3 requirements', () => {
        it('accepts rejected file without S3 info', async () => {
          const id = `contract-rejected-no-s3-${randomUUID()}`
          const rejectedLog = buildSummaryLog({
            status: 'rejected',
            file: buildRejectedFile({ name: 'virus.xlsx' })
          })

          await repository.insert(id, rejectedLog)

          const found = await repository.findById(id)
          expect(found.summaryLog.file.status).toBe('rejected')
          expect(found.summaryLog.file.s3).toBeUndefined()
        })

        it('requires S3 info when file status is complete', async () => {
          const id = `contract-complete-no-s3-${randomUUID()}`
          const completeLogWithoutS3 = buildSummaryLog({
            file: {
              id: generateFileId(),
              name: 'test.xlsx',
              status: 'complete'
            }
          })

          await expect(
            repository.insert(id, completeLogWithoutS3)
          ).rejects.toThrow(/Invalid summary log data.*s3/)
        })

        it('accepts pending file without S3 info', async () => {
          const id = `contract-pending-no-s3-${randomUUID()}`
          const pendingLog = buildSummaryLog({
            status: 'preprocessing',
            file: buildPendingFile({ name: 'scanning.xlsx' })
          })

          await repository.insert(id, pendingLog)

          const found = await repository.findById(id)
          expect(found.summaryLog.file.status).toBe('pending')
          expect(found.summaryLog.file.s3).toBeUndefined()
        })
      })
    })
  })
}
