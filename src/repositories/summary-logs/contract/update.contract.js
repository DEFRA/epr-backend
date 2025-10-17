import { randomUUID } from 'node:crypto'
import {
  TEST_S3_BUCKET,
  buildFile,
  buildPendingFile,
  buildSummaryLog
} from './test-data.js'

export const testUpdateBehaviour = (repositoryFactory) => {
  describe('update', () => {
    let repository
    const logger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn()
    }

    beforeEach(async () => {
      repository = await repositoryFactory(logger)
    })

    describe('basic behaviour', () => {
      it('updates an existing summary log', async () => {
        const id = `contract-update-${randomUUID()}`
        const summaryLog = buildSummaryLog({
          status: 'preprocessing',
          file: buildPendingFile({ name: 'scanning.xlsx' })
        })

        await repository.insert(id, summaryLog)
        const current = await repository.findById(id)

        await repository.update(id, current.version, {
          status: 'validating',
          file: buildFile({
            id: summaryLog.file.id,
            name: summaryLog.file.name
          })
        })

        const found = await repository.findById(id)
        expect(found.summaryLog.status).toBe('validating')
        expect(found.summaryLog.file.status).toBe('complete')
        expect(found.summaryLog.file.s3.bucket).toBe(TEST_S3_BUCKET)
      })

      it('throws not found error when updating non-existent ID', async () => {
        const id = `contract-nonexistent-${randomUUID()}`

        await expect(
          repository.update(id, 1, { status: 'validating' })
        ).rejects.toMatchObject({
          isBoom: true,
          output: { statusCode: 404 }
        })
      })

      it('preserves existing fields not included in update', async () => {
        const id = `contract-preserve-${randomUUID()}`
        const summaryLog = buildSummaryLog({
          status: 'preprocessing',
          organisationId: 'org-123',
          registrationId: 'reg-456',
          file: buildPendingFile()
        })

        await repository.insert(id, summaryLog)
        const current = await repository.findById(id)

        await repository.update(id, current.version, {
          status: 'rejected'
        })

        const found = await repository.findById(id)
        expect(found.summaryLog.status).toBe('rejected')
        expect(found.summaryLog.organisationId).toBe('org-123')
        expect(found.summaryLog.registrationId).toBe('reg-456')
      })
    })

    describe('validation', () => {
      describe('id parameter', () => {
        it('rejects null id', async () => {
          await expect(
            repository.update(null, 1, { status: 'validating' })
          ).rejects.toThrow(/id/)
        })

        it('rejects undefined id', async () => {
          await expect(
            repository.update(undefined, 1, { status: 'validating' })
          ).rejects.toThrow(/id/)
        })

        it('rejects empty string id', async () => {
          await expect(
            repository.update('', 1, { status: 'validating' })
          ).rejects.toThrow(/id/)
        })

        it('rejects number id', async () => {
          const invalidNumberId = 123
          await expect(
            repository.update(invalidNumberId, 1, { status: 'validating' })
          ).rejects.toThrow(/id/)
        })

        it('rejects object id', async () => {
          await expect(
            repository.update({}, 1, { status: 'validating' })
          ).rejects.toThrow(/id/)
        })
      })

      describe('updates parameter', () => {
        it('strips unknown fields from updates', async () => {
          const id = `contract-strip-update-${randomUUID()}`
          const summaryLog = buildSummaryLog()
          await repository.insert(id, summaryLog)

          await repository.update(id, 1, {
            status: 'validating',
            hackerField: 'DROP TABLE users;',
            evilField: 'rm -rf /'
          })

          const found = await repository.findById(id)
          expect(found.summaryLog.hackerField).toBeUndefined()
          expect(found.summaryLog.evilField).toBeUndefined()
          expect(found.summaryLog.status).toBe('validating')
        })

        it('rejects update with invalid status', async () => {
          const id = `contract-invalid-update-status-${randomUUID()}`
          const summaryLog = buildSummaryLog()
          await repository.insert(id, summaryLog)

          await expect(
            repository.update(id, 1, { status: 'invalid-status' })
          ).rejects.toThrow(/status/)
        })

        it('rejects update with null status', async () => {
          const id = `contract-null-status-${randomUUID()}`
          const summaryLog = buildSummaryLog()
          await repository.insert(id, summaryLog)

          await expect(
            repository.update(id, 1, { status: null })
          ).rejects.toThrow(/status/)
        })

        it('rejects update with empty file object', async () => {
          const id = `contract-empty-file-${randomUUID()}`
          const summaryLog = buildSummaryLog()
          await repository.insert(id, summaryLog)

          await expect(repository.update(id, 1, { file: {} })).rejects.toThrow(
            /file/
          )
        })

        it('rejects update with file missing required fields', async () => {
          const id = `contract-file-missing-fields-${randomUUID()}`
          const summaryLog = buildSummaryLog()
          await repository.insert(id, summaryLog)

          await expect(
            repository.update(id, 1, {
              file: { name: 'test.xlsx' }
            })
          ).rejects.toThrow(/id/)
        })
      })
    })
  })
}
