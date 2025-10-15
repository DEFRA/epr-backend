import { randomUUID } from 'node:crypto'
import {
  TEST_S3_BUCKET,
  buildFile,
  buildPendingFile,
  buildSummaryLog
} from './test-data.js'

export const testUpdateBehaviour = (getRepository) => {
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
