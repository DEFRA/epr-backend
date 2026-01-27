/**
 * Tests for S3-based repository adapter plugins.
 *
 * These plugins use the config module directly, so we mock the dependencies
 * rather than the full config.
 */
import Hapi from '@hapi/hapi'
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the config module before importing the plugins
vi.mock('#root/config.js', () => ({
  config: {
    get: vi.fn((key) => {
      const mockConfig = {
        awsRegion: 'eu-west-2',
        s3Endpoint: 'http://localhost:4566',
        isDevelopment: true,
        'cdpUploader.url': 'http://localhost:7337',
        'cdpUploader.s3Bucket': 'test-summary-logs'
      }
      return mockConfig[key]
    })
  }
}))

// Mock the S3 client
vi.mock('#common/helpers/s3/s3-client.js', () => ({
  createS3Client: vi.fn(() => ({
    send: vi.fn()
  }))
}))

// Mock the public register config
vi.mock('#adapters/repositories/public-register/config.js', () => ({
  publicRegisterConfig: {
    s3Bucket: 'test-public-register',
    preSignedUrlExpiry: 3600
  }
}))

// Mock the uploads repository
vi.mock('#adapters/repositories/uploads/cdp-uploader.js', () => ({
  createUploadsRepository: vi.fn(() => ({
    initiateSummaryLogUpload: vi.fn().mockResolvedValue({
      uploadUrl: 'http://test-upload-url',
      uploadId: 'test-upload-id'
    }),
    findSummaryLogById: vi.fn().mockResolvedValue(null)
  }))
}))

// Mock the public register repository
vi.mock('#adapters/repositories/public-register/public-register.js', () => ({
  createPublicRegisterRepository: vi.fn(() => ({
    save: vi.fn().mockResolvedValue(undefined),
    generatePresignedUrl: vi.fn().mockResolvedValue({
      url: 'http://test-presigned-url',
      expiresAt: new Date(Date.now() + 3600000).toISOString()
    })
  }))
}))

// Now import the plugins (after mocks are set up)
const { s3UploadsRepositoryPlugin } =
  await import('./s3-uploads-repository-plugin.js')
const { s3PublicRegisterRepositoryPlugin } =
  await import('./s3-public-register-repository-plugin.js')

describe('S3 adapter plugins', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('s3UploadsRepositoryPlugin', () => {
    it('makes repository available on request via plugin', async () => {
      const server = Hapi.server()
      await server.register(s3UploadsRepositoryPlugin)

      server.route({
        method: 'POST',
        path: '/test',
        options: { auth: false },
        handler: async (request) => {
          const result =
            await request.uploadsRepository.initiateSummaryLogUpload({
              organisationId: 'org-123',
              registrationId: 'reg-456',
              callbackUrl: 'http://localhost/callback'
            })
          return {
            hasUploadUrl: !!result.uploadUrl,
            hasUploadId: !!result.uploadId
          }
        }
      })

      await server.initialize()
      const response = await server.inject({ method: 'POST', url: '/test' })
      const result = JSON.parse(response.payload)

      expect(result.hasUploadUrl).toBe(true)
      expect(result.hasUploadId).toBe(true)
    })
  })

  describe('s3PublicRegisterRepositoryPlugin', () => {
    it('makes repository available on request via plugin', async () => {
      const server = Hapi.server()
      await server.register(s3PublicRegisterRepositoryPlugin)

      server.route({
        method: 'POST',
        path: '/test',
        options: { auth: false },
        handler: async (request) => {
          await request.publicRegisterRepository.save('test.csv', 'data')
          const result =
            await request.publicRegisterRepository.generatePresignedUrl(
              'test.csv'
            )
          return { hasUrl: !!result.url }
        }
      })

      await server.initialize()
      const response = await server.inject({ method: 'POST', url: '/test' })
      const result = JSON.parse(response.payload)

      expect(result.hasUrl).toBe(true)
    })
  })
})
