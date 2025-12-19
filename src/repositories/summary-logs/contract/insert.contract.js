import { describe, beforeEach, expect } from 'vitest'
import { randomUUID } from 'node:crypto'
import {
  calculateExpiresAt,
  NO_PRIOR_SUBMISSION,
  SUMMARY_LOG_STATUS
} from '#domain/summary-logs/status.js'
import {
  generateFileId,
  buildPendingFile,
  summaryLogFactory
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

        await repository.insert(
          id,
          summaryLogFactory.validating({
            organisationId: 'org-123',
            registrationId: 'reg-456'
          })
        )

        const found = await repository.findById(id)
        expect(found).toBeTruthy()
      })

      it('stores the summary log so it can be retrieved', async () => {
        const id = `contract-retrievable-${randomUUID()}`

        await repository.insert(
          id,
          summaryLogFactory.validating({
            organisationId: 'org-456',
            registrationId: 'reg-789'
          })
        )
        const found = await repository.findById(id)

        expect(found).toBeTruthy()
        expect(found.summaryLog.organisationId).toBe('org-456')
        expect(found.summaryLog.registrationId).toBe('reg-789')
      })

      it('throws conflict error when inserting duplicate ID', async () => {
        const id = `contract-duplicate-${randomUUID()}`
        const summaryLog = summaryLogFactory.validating()

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
        const summaryLogA = summaryLogFactory.validating({
          organisationId: 'org-A'
        })
        const summaryLogB = summaryLogFactory.validating({
          organisationId: 'org-B'
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
          await expect(
            repository.insert(
              id,
              summaryLogFactory.validating({ file: { id: null } })
            )
          ).rejects.toThrow(/Invalid summary log data.*id/)
        })

        it('rejects insert with missing file.name', async () => {
          const id = `contract-validation-${randomUUID()}`
          await expect(
            repository.insert(
              id,
              summaryLogFactory.validating({ file: { name: null } })
            )
          ).rejects.toThrow(/Invalid summary log data.*name/)
        })

        it('rejects insert with missing URI when file status is complete', async () => {
          const id = `contract-validation-${randomUUID()}`
          await expect(
            repository.insert(
              id,
              summaryLogFactory.validating({ file: { uri: undefined } })
            )
          ).rejects.toThrow(/Invalid summary log data.*uri/)
        })
      })

      describe('field handling', () => {
        it('rejects insert with invalid file.status', async () => {
          const id = `contract-invalid-status-${randomUUID()}`
          await expect(
            repository.insert(
              id,
              summaryLogFactory.validating({
                file: { status: 'invalid-status' }
              })
            )
          ).rejects.toThrow(/Invalid summary log data.*status/)
        })

        it('strips unknown fields from insert', async () => {
          const id = `contract-strip-${randomUUID()}`

          await repository.insert(
            id,
            summaryLogFactory.validating({
              file: {
                hackerField: 'DROP TABLE users;',
                anotherBadField: 'rm -rf /'
              }
            })
          )
          const found = await repository.findById(id)

          expect(found.summaryLog.hackerField).toBeUndefined()
          expect(found.summaryLog.anotherBadField).toBeUndefined()
        })

        it('allows optional fields to be omitted', async () => {
          const id = `contract-minimal-${randomUUID()}`

          await repository.insert(id, summaryLogFactory.validating())

          const found = await repository.findById(id)
          expect(found).toBeTruthy()
        })

        it('preserves validatedAgainstSummaryLogId on insert', async () => {
          const id = `contract-baseline-${randomUUID()}`
          const baselineSummaryLogId = `previous-submitted-${randomUUID()}`

          await repository.insert(
            id,
            summaryLogFactory.validating({
              validatedAgainstSummaryLogId: baselineSummaryLogId
            })
          )

          const found = await repository.findById(id)
          expect(found.summaryLog.validatedAgainstSummaryLogId).toBe(
            baselineSummaryLogId
          )
        })

        it('preserves NO_PRIOR_SUBMISSION validatedAgainstSummaryLogId on insert', async () => {
          const id = `contract-no-prior-baseline-${randomUUID()}`

          await repository.insert(id, summaryLogFactory.validating())

          const found = await repository.findById(id)
          expect(found.summaryLog.validatedAgainstSummaryLogId).toBe(
            NO_PRIOR_SUBMISSION
          )
        })

        it('accepts valid file.status values', async () => {
          const id1 = `contract-complete-${randomUUID()}`
          const id2 = `contract-rejected-${randomUUID()}`

          await repository.insert(
            id1,
            summaryLogFactory.validating({ file: { name: 'complete.xlsx' } })
          )
          await repository.insert(id2, summaryLogFactory.rejected())

          const found1 = await repository.findById(id1)
          const found2 = await repository.findById(id2)
          expect(found1.summaryLog.file.status).toBe('complete')
          expect(found2.summaryLog.file.status).toBe('rejected')
        })
      })

      describe('preprocessing status without file', () => {
        it('accepts preprocessing status without file data', async () => {
          const id = `contract-preprocessing-no-file-${randomUUID()}`

          await repository.insert(
            id,
            summaryLogFactory.preprocessing({
              organisationId: 'org-123',
              registrationId: 'reg-456'
            })
          )

          const found = await repository.findById(id)
          expect(found.summaryLog.status).toBe(SUMMARY_LOG_STATUS.PREPROCESSING)
          expect(found.summaryLog.file).toBeUndefined()
        })

        it('rejects non-preprocessing status without file data', async () => {
          const id = `contract-validating-no-file-${randomUUID()}`
          // Inline object needed to test schema rejection - factory would auto-add file
          const validatingLogWithoutFile = {
            status: SUMMARY_LOG_STATUS.VALIDATING,
            expiresAt: calculateExpiresAt(SUMMARY_LOG_STATUS.VALIDATING),
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

          await repository.insert(id, summaryLogFactory.rejected())

          const found = await repository.findById(id)
          expect(found.summaryLog.file.status).toBe('rejected')
          expect(found.summaryLog.file.uri).toBeUndefined()
        })

        it('requires URI when file status is complete', async () => {
          const id = `contract-complete-no-uri-${randomUUID()}`
          // Inline object needed to test schema rejection - factory would auto-add URI
          const completeLogWithoutUri = {
            status: SUMMARY_LOG_STATUS.VALIDATING,
            expiresAt: calculateExpiresAt(SUMMARY_LOG_STATUS.VALIDATING),
            validatedAgainstSummaryLogId: NO_PRIOR_SUBMISSION,
            file: {
              id: generateFileId(),
              name: 'test.xlsx',
              status: 'complete'
            }
          }

          await expect(
            repository.insert(id, completeLogWithoutUri)
          ).rejects.toThrow(/Invalid summary log data.*uri/)
        })

        it('accepts pending file without S3 info', async () => {
          const id = `contract-pending-no-s3-${randomUUID()}`

          await repository.insert(
            id,
            summaryLogFactory.preprocessing({ file: buildPendingFile() })
          )

          const found = await repository.findById(id)
          expect(found.summaryLog.file.status).toBe('pending')
          expect(found.summaryLog.file.s3).toBeUndefined()
        })
      })
    })
  })
}
