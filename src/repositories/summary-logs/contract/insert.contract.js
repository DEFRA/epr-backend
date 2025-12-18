import { describe, beforeEach, expect } from 'vitest'
import { randomUUID } from 'node:crypto'
import {
  SUMMARY_LOG_STATUS,
  NO_PRIOR_SUBMISSION
} from '#domain/summary-logs/status.js'
import {
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

        const found = await repository.findById(id)
        expect(found).toBeTruthy()
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
            uri: 's3://test-bucket/test-key-A'
          })
        })
        const summaryLogB = buildSummaryLog({
          organisationId: 'org-B',
          file: buildFile({
            name: 'testB.xlsx',
            uri: 's3://test-bucket/test-key-B'
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

    describe('org/reg submission constraint', () => {
      it('throws 409 when inserting if a submitting log exists for same org/reg', async () => {
        const organisationId = `org-constraint-${randomUUID()}`
        const registrationId = `reg-constraint-${randomUUID()}`

        // Insert a log in submitting status
        const existingId = `existing-submitting-${randomUUID()}`
        await repository.insert(
          existingId,
          buildSummaryLog({
            status: SUMMARY_LOG_STATUS.SUBMITTING,
            organisationId,
            registrationId
          })
        )

        // Attempt to insert a new log for same org/reg
        const newId = `new-log-${randomUUID()}`
        const newLog = {
          status: SUMMARY_LOG_STATUS.PREPROCESSING,
          organisationId,
          registrationId
        }

        await expect(repository.insert(newId, newLog)).rejects.toMatchObject({
          isBoom: true,
          output: { statusCode: 409 },
          message: 'A submission is in progress. Please wait.'
        })

        // Verify the new log was not inserted
        const notFound = await repository.findById(newId)
        expect(notFound).toBeNull()
      })

      it('allows insert when submitting log is for different registration', async () => {
        const organisationId = `org-shared-${randomUUID()}`

        // Insert a log in submitting status for reg-A
        const existingId = `existing-reg-a-${randomUUID()}`
        await repository.insert(
          existingId,
          buildSummaryLog({
            status: SUMMARY_LOG_STATUS.SUBMITTING,
            organisationId,
            registrationId: `reg-A-${randomUUID()}`
          })
        )

        // Insert a new log for reg-B (same org, different registration)
        const newId = `new-reg-b-${randomUUID()}`
        const newLog = {
          status: SUMMARY_LOG_STATUS.PREPROCESSING,
          organisationId,
          registrationId: `reg-B-${randomUUID()}`
        }

        await repository.insert(newId, newLog)

        const found = await repository.findById(newId)
        expect(found).toBeTruthy()
      })

      it('allows insert when existing log for same org/reg is not submitting', async () => {
        const organisationId = `org-non-submitting-${randomUUID()}`
        const registrationId = `reg-non-submitting-${randomUUID()}`

        // Insert logs in various non-submitting statuses
        const statuses = [
          SUMMARY_LOG_STATUS.PREPROCESSING,
          SUMMARY_LOG_STATUS.VALIDATING,
          SUMMARY_LOG_STATUS.VALIDATED,
          SUMMARY_LOG_STATUS.SUBMITTED,
          SUMMARY_LOG_STATUS.SUPERSEDED,
          SUMMARY_LOG_STATUS.REJECTED
        ]

        for (const status of statuses) {
          const existingId = `existing-${status}-${randomUUID()}`
          const existingLog =
            status === SUMMARY_LOG_STATUS.PREPROCESSING
              ? { status, organisationId, registrationId }
              : buildSummaryLog({ status, organisationId, registrationId })

          await repository.insert(existingId, existingLog)
        }

        // Insert a new log - should succeed
        const newId = `new-after-non-submitting-${randomUUID()}`
        const newLog = {
          status: SUMMARY_LOG_STATUS.PREPROCESSING,
          organisationId,
          registrationId
        }

        await repository.insert(newId, newLog)

        const found = await repository.findById(newId)
        expect(found).toBeTruthy()
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

        it('rejects insert with missing URI when file status is complete', async () => {
          const id = `contract-validation-${randomUUID()}`
          const logWithMissingUri = buildSummaryLog({
            file: buildFile({ uri: undefined })
          })
          await expect(
            repository.insert(id, logWithMissingUri)
          ).rejects.toThrow(/Invalid summary log data.*uri/)
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

          const found = await repository.findById(id)
          expect(found).toBeTruthy()
        })

        it('preserves validatedAgainstSummaryLogId on insert', async () => {
          const id = `contract-baseline-${randomUUID()}`
          const baselineSummaryLogId = `previous-submitted-${randomUUID()}`
          const summaryLog = buildSummaryLog({
            validatedAgainstSummaryLogId: baselineSummaryLogId
          })

          await repository.insert(id, summaryLog)

          const found = await repository.findById(id)
          expect(found.summaryLog.validatedAgainstSummaryLogId).toBe(
            baselineSummaryLogId
          )
        })

        it('preserves NO_PRIOR_SUBMISSION validatedAgainstSummaryLogId on insert', async () => {
          const id = `contract-no-prior-baseline-${randomUUID()}`
          const summaryLog = buildSummaryLog({
            validatedAgainstSummaryLogId: NO_PRIOR_SUBMISSION
          })

          await repository.insert(id, summaryLog)

          const found = await repository.findById(id)
          expect(found.summaryLog.validatedAgainstSummaryLogId).toBe(
            NO_PRIOR_SUBMISSION
          )
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

          const found1 = await repository.findById(id1)
          const found2 = await repository.findById(id2)
          expect(found1.summaryLog.file.status).toBe('complete')
          expect(found2.summaryLog.file.status).toBe('rejected')
        })
      })

      describe('preprocessing status without file', () => {
        it('accepts preprocessing status without file data', async () => {
          const id = `contract-preprocessing-no-file-${randomUUID()}`
          const preprocessingLog = {
            status: 'preprocessing',
            organisationId: 'org-123',
            registrationId: 'reg-456'
          }

          await repository.insert(id, preprocessingLog)

          const found = await repository.findById(id)
          expect(found.summaryLog.status).toBe('preprocessing')
          expect(found.summaryLog.file).toBeUndefined()
        })

        it('rejects non-preprocessing status without file data', async () => {
          const id = `contract-validating-no-file-${randomUUID()}`
          const validatingLogWithoutFile = {
            status: 'validating',
            organisationId: 'org-123',
            registrationId: 'reg-456'
          }

          await expect(
            repository.insert(id, validatingLogWithoutFile)
          ).rejects.toThrow(/Invalid summary log data.*file/)
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
          expect(found.summaryLog.file.uri).toBeUndefined()
        })

        it('requires URI when file status is complete', async () => {
          const id = `contract-complete-no-uri-${randomUUID()}`
          const completeLogWithoutUri = buildSummaryLog({
            file: {
              id: generateFileId(),
              name: 'test.xlsx',
              status: 'complete'
            }
          })

          await expect(
            repository.insert(id, completeLogWithoutUri)
          ).rejects.toThrow(/Invalid summary log data.*uri/)
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
