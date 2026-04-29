import { describe, beforeEach, expect } from 'vitest'
import { randomUUID } from 'node:crypto'
import { summaryLogFactory } from './test-data.js'

export const testGetDownloadUrlBehaviour = (it) => {
  describe('getDownloadUrl', () => {
    let repository

    beforeEach(async ({ summaryLogsRepository }) => {
      repository = summaryLogsRepository
    })

    it('returns a download URL for a submitted summary log', async () => {
      const id = `contract-${randomUUID()}`
      await repository.insert(
        id,
        summaryLogFactory.submitted({
          organisationId: 'org-1',
          registrationId: 'reg-1',
          file: { uri: 's3://re-ex-summary-logs/uploads/test-file.xlsx' }
        })
      )

      const result = await repository.getDownloadUrl(id)

      expect(result.url).toBeDefined()
      expect(result.expiresAt).toBeDefined()
      expect(new Date(result.expiresAt).getTime()).toBeGreaterThan(Date.now())
    })

    it('throws 404 when summary log does not exist', async () => {
      const id = `contract-nonexistent-${randomUUID()}`

      await expect(repository.getDownloadUrl(id)).rejects.toThrow(
        'Summary log file not found'
      )
    })

    it('throws a structured cdp-boom internal error when file URI is malformed', async () => {
      const id = `contract-${randomUUID()}`
      await repository.insert(
        id,
        summaryLogFactory.submitted({
          organisationId: 'org-1',
          registrationId: 'reg-1',
          file: { uri: 'not a valid uri' }
        })
      )

      await expect(repository.getDownloadUrl(id)).rejects.toMatchObject({
        isBoom: true,
        output: { statusCode: 500 },
        code: 'summary_log_uri_corrupt',
        event: {
          action: 'get_download_url',
          reason: `summaryLogId=${id} type=TypeError code=ERR_INVALID_URL`
        }
      })
    })

    it('throws 404 when summary log has no file URI', async () => {
      const id = `contract-${randomUUID()}`
      await repository.insert(
        id,
        summaryLogFactory.preprocessing({
          organisationId: 'org-1',
          registrationId: 'reg-1'
        })
      )

      await expect(repository.getDownloadUrl(id)).rejects.toThrow(
        'Summary log file not found'
      )
    })
  })
}
