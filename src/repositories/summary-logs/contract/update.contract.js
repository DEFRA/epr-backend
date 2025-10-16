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

    const getRepository = () => repository

    beforeEach(async () => {
      repository = await repositoryFactory(logger)
    })

    describe('basic behaviour', () => {
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

        await getRepository().update(id, current.version, {
          status: 'rejected'
        })

        const found = await getRepository().findById(id)
        expect(found.status).toBe('rejected')
        expect(found.organisationId).toBe('org-123')
        expect(found.registrationId).toBe('reg-456')
      })
    })

    describe('validation', () => {
      describe('id parameter', () => {
        it('rejects null id', async () => {
          await expect(
            getRepository().update(null, 1, { status: 'validating' })
          ).rejects.toThrow(/id/)
        })

        it('rejects undefined id', async () => {
          await expect(
            getRepository().update(undefined, 1, { status: 'validating' })
          ).rejects.toThrow(/id/)
        })

        it('rejects empty string id', async () => {
          await expect(
            getRepository().update('', 1, { status: 'validating' })
          ).rejects.toThrow(/id/)
        })

        it('rejects number id', async () => {
          const invalidNumberId = 123
          await expect(
            getRepository().update(invalidNumberId, 1, { status: 'validating' })
          ).rejects.toThrow(/id/)
        })

        it('rejects object id', async () => {
          await expect(
            getRepository().update({}, 1, { status: 'validating' })
          ).rejects.toThrow(/id/)
        })
      })

      describe('updates parameter', () => {
        it('strips unknown fields from updates', async () => {
          const id = `contract-strip-update-${randomUUID()}`
          const summaryLog = buildSummaryLog(id)
          await getRepository().insert(summaryLog)

          await getRepository().update(id, 1, {
            status: 'validating',
            hackerField: 'DROP TABLE users;',
            evilField: 'rm -rf /'
          })

          const found = await getRepository().findById(id)
          expect(found.hackerField).toBeUndefined()
          expect(found.evilField).toBeUndefined()
          expect(found.status).toBe('validating')
        })

        it('rejects update with invalid status', async () => {
          const id = `contract-invalid-update-status-${randomUUID()}`
          const summaryLog = buildSummaryLog(id)
          await getRepository().insert(summaryLog)

          await expect(
            getRepository().update(id, 1, { status: 'invalid-status' })
          ).rejects.toThrow(/status/)
        })

        it('rejects update with null status', async () => {
          const id = `contract-null-status-${randomUUID()}`
          const summaryLog = buildSummaryLog(id)
          await getRepository().insert(summaryLog)

          await expect(
            getRepository().update(id, 1, { status: null })
          ).rejects.toThrow(/status/)
        })

        it('rejects update with empty file object', async () => {
          const id = `contract-empty-file-${randomUUID()}`
          const summaryLog = buildSummaryLog(id)
          await getRepository().insert(summaryLog)

          await expect(
            getRepository().update(id, 1, { file: {} })
          ).rejects.toThrow(/file/)
        })

        it('rejects update with file missing required fields', async () => {
          const id = `contract-file-missing-fields-${randomUUID()}`
          const summaryLog = buildSummaryLog(id)
          await getRepository().insert(summaryLog)

          await expect(
            getRepository().update(id, 1, {
              file: { name: 'test.xlsx' }
            })
          ).rejects.toThrow(/id/)
        })
      })
    })
  })
}
