import { vi, describe, test, expect, afterEach } from 'vitest'

import { initiateCdpUpload } from './cdp-uploader.js'

describe('#initiateCdpUpload', () => {
  const cdpUploaderUrl = 'https://cdp-uploader.test.cdp-int.defra.cloud'
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
  })

  describe('on successful response', () => {
    test('returns upload details from CDP Uploader', async () => {
      const mockResponse = {
        uploadId: 'fc730e47-73c6-4219-a3c5-49b6dfce6e71',
        uploadUrl: '/upload-and-scan/fc730e47-73c6-4219-a3c5-49b6dfce6e71',
        statusUrl:
          'https://cdp-uploader.test.cdp-int.defra.cloud/status/fc730e47-73c6-4219-a3c5-49b6dfce6e71'
      }

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
        headers: new Map()
      })

      const options = {
        redirect:
          '/organisations/org-123/registrations/reg-456/summary-logs/sl-789',
        callback:
          'https://epr-backend.test/v1/organisations/org-123/registrations/reg-456/summary-logs/sl-789/upload-completed',
        s3Bucket: 'tenant-bucket',
        s3Path: '/organisations/org-123/registrations/reg-456',
        mimeTypes: [
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        ],
        maxFileSize: 10485760,
        metadata: { summaryLogId: 'sl-789' }
      }

      const result = await initiateCdpUpload(cdpUploaderUrl, options)

      expect(result).toEqual(mockResponse)
      expect(global.fetch).toHaveBeenCalledWith(`${cdpUploaderUrl}/initiate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options)
      })
    })
  })

  describe('on error responses', () => {
    test('throws Boom error when CDP Uploader returns error', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        headers: new Map([['content-type', 'application/json']]),
        json: async () => ({ message: 'Invalid mimeTypes' })
      })

      const options = {
        redirect: '/test',
        callback: 'https://test/callback',
        s3Bucket: 'bucket',
        mimeTypes: ['invalid/type']
      }

      await expect(
        initiateCdpUpload(cdpUploaderUrl, options)
      ).rejects.toMatchObject({
        isBoom: true,
        output: { statusCode: 400 }
      })
    })

    test('throws Boom internal error on network failure', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

      const options = {
        redirect: '/test',
        callback: 'https://test/callback',
        s3Bucket: 'bucket',
        mimeTypes: ['application/pdf']
      }

      await expect(
        initiateCdpUpload(cdpUploaderUrl, options)
      ).rejects.toMatchObject({
        isBoom: true,
        output: { statusCode: 500 }
      })
    })
  })
})
