import { describe, beforeEach } from 'vitest'

/**
 * Contract tests for file storage operations (findByLocation).
 * Use this for adapters with real storage backends (e.g. S3).
 */
export const testUploadsRepositoryFileContract = (it) => {
  describe('uploads repository file contract', () => {
    let uploadsRepository

    beforeEach(async ({ uploadsRepository: repo }) => {
      uploadsRepository = repo
    })

    describe('findByLocation', () => {
      it('should return expected result when file exists', async () => {
        const result = await uploadsRepository.findByLocation(
          's3://test-bucket/path/to/summary-log.xlsx'
        )

        expect(result).toBeInstanceOf(Buffer)
      })

      it('should return expected result when file does not exist', async () => {
        const result = await uploadsRepository.findByLocation(
          's3://non-existent-bucket/non-existent-key'
        )

        expect(result).toBeNull()
      })
    })
  })
}

/**
 * Contract tests for summary log upload initiation.
 * Use this for adapters where initiate can be tested without external HTTP calls.
 */
export const testUploadsRepositoryInitiateContract = (it) => {
  describe('uploads repository initiate contract', () => {
    let uploadsRepository

    beforeEach(async ({ uploadsRepository: repo }) => {
      uploadsRepository = repo
    })

    describe('initiateSummaryLogUpload', () => {
      it('returns upload details on successful initiation', async () => {
        const options = {
          organisationId: 'org-123',
          registrationId: 'reg-456',
          summaryLogId: 'sl-789'
        }

        const result = await uploadsRepository.initiateSummaryLogUpload(options)

        expect(result).toMatchObject({
          uploadId: expect.any(String),
          uploadUrl: expect.any(String),
          statusUrl: expect.any(String)
        })
      })

      it('includes uploadId in uploadUrl', async () => {
        const options = {
          organisationId: 'org-123',
          registrationId: 'reg-456',
          summaryLogId: 'sl-001'
        }

        const result = await uploadsRepository.initiateSummaryLogUpload(options)

        expect(result.uploadUrl).toContain(result.uploadId)
      })

      it('includes uploadId in statusUrl', async () => {
        const options = {
          organisationId: 'org-123',
          registrationId: 'reg-456',
          summaryLogId: 'sl-002'
        }

        const result = await uploadsRepository.initiateSummaryLogUpload(options)

        expect(result.statusUrl).toContain(result.uploadId)
      })
    })
  })
}

/**
 * Full contract tests - use for in-memory adapter.
 */
export const testUploadsRepositoryContract = (it) => {
  testUploadsRepositoryFileContract(it)
  testUploadsRepositoryInitiateContract(it)
}
