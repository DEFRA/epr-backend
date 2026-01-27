import Hapi from '@hapi/hapi'
import { describe, test, expect, beforeEach, vi, afterEach } from 'vitest'
import { mongoRepositoriesPlugin } from './mongo-repositories-plugin.js'

// Mock MongoDB and S3 dependencies
vi.mock('#common/helpers/s3/s3-client.js', () => ({
  createS3Client: vi.fn(() => ({}))
}))

vi.mock('#root/config.js', () => ({
  config: {
    get: vi.fn((key) => {
      const configValues = {
        awsRegion: 'eu-west-2',
        s3Endpoint: 'http://localhost:4566',
        isDevelopment: true,
        'cdpUploader.url': 'http://localhost:3000',
        'cdpUploader.s3Bucket': 'test-bucket'
      }
      return configValues[key]
    })
  }
}))

vi.mock('#adapters/repositories/public-register/config.js', () => ({
  publicRegisterConfig: {
    s3Bucket: 'test-public-register-bucket',
    preSignedUrlExpiry: 3600
  }
}))

describe('mongoRepositoriesPlugin', () => {
  /** @type {import('@hapi/hapi').Server} */
  let server
  let mockDb

  beforeEach(async () => {
    // Create mock MongoDB database
    mockDb = {
      collection: vi.fn(() => ({
        createIndex: vi.fn(),
        findOne: vi.fn(),
        find: vi.fn(() => ({ toArray: vi.fn(() => []) })),
        insertOne: vi.fn(),
        replaceOne: vi.fn()
      }))
    }

    server = Hapi.server()

    // Register a fake mongodb plugin to satisfy the dependency
    const fakeMongoDbPlugin = {
      name: 'mongodb',
      register: (srv) => {
        srv.decorate('server', 'db', mockDb)
      }
    }

    await server.register([fakeMongoDbPlugin, mongoRepositoriesPlugin])

    // Add a test route to access request.repositories
    server.route({
      method: 'GET',
      path: '/test-repositories',
      handler: (request) => {
        return {
          hasRepositories: request.repositories !== undefined,
          summaryLogs: {
            hasInsert:
              typeof request.repositories?.summaryLogs?.insert === 'function',
            hasFindById:
              typeof request.repositories?.summaryLogs?.findById === 'function'
          },
          organisations: {
            hasInsert:
              typeof request.repositories?.organisations?.insert === 'function',
            hasFindById:
              typeof request.repositories?.organisations?.findById ===
              'function'
          },
          formSubmissions: {
            hasFindRegistrationById:
              typeof request.repositories?.formSubmissions
                ?.findRegistrationById === 'function'
          },
          wasteRecords: {
            hasFindByRegistration:
              typeof request.repositories?.wasteRecords?.findByRegistration ===
              'function'
          },
          wasteBalances: {
            hasFindByAccreditationId:
              typeof request.repositories?.wasteBalances
                ?.findByAccreditationId === 'function'
          },
          systemLogs: {
            hasInsert:
              typeof request.repositories?.systemLogs?.insert === 'function'
          },
          uploads: {
            hasInitiateUpload:
              typeof request.repositories?.uploads?.initiateSummaryLogUpload ===
              'function'
          },
          publicRegister: {
            hasSave:
              typeof request.repositories?.publicRegister?.save === 'function'
          }
        }
      }
    })

    await server.initialize()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('has plugin name "repositories"', () => {
    expect(mongoRepositoriesPlugin.name).toBe('repositories')
  })

  test('declares mongodb as a dependency', () => {
    expect(mongoRepositoriesPlugin.dependencies).toContain('mongodb')
  })

  test('provides repositories on request object', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/test-repositories'
    })

    const payload = JSON.parse(response.payload)
    expect(payload.hasRepositories).toBe(true)
  })

  describe('request.repositories', () => {
    test('has summaryLogs repository with expected methods', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/test-repositories'
      })

      const payload = JSON.parse(response.payload)
      expect(payload.summaryLogs.hasInsert).toBe(true)
      expect(payload.summaryLogs.hasFindById).toBe(true)
    })

    test('has organisations repository with expected methods', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/test-repositories'
      })

      const payload = JSON.parse(response.payload)
      expect(payload.organisations.hasInsert).toBe(true)
      expect(payload.organisations.hasFindById).toBe(true)
    })

    test('has formSubmissions repository with expected methods', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/test-repositories'
      })

      const payload = JSON.parse(response.payload)
      expect(payload.formSubmissions.hasFindRegistrationById).toBe(true)
    })

    test('has wasteRecords repository with expected methods', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/test-repositories'
      })

      const payload = JSON.parse(response.payload)
      expect(payload.wasteRecords.hasFindByRegistration).toBe(true)
    })

    test('has wasteBalances repository with expected methods', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/test-repositories'
      })

      const payload = JSON.parse(response.payload)
      expect(payload.wasteBalances.hasFindByAccreditationId).toBe(true)
    })

    test('has systemLogs repository with expected methods', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/test-repositories'
      })

      const payload = JSON.parse(response.payload)
      expect(payload.systemLogs.hasInsert).toBe(true)
    })

    test('has uploads repository with expected methods', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/test-repositories'
      })

      const payload = JSON.parse(response.payload)
      expect(payload.uploads.hasInitiateUpload).toBe(true)
    })

    test('has publicRegister repository with expected methods', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/test-repositories'
      })

      const payload = JSON.parse(response.payload)
      expect(payload.publicRegister.hasSave).toBe(true)
    })
  })

  test('caches repository instances within a request', async () => {
    // Add route that accesses repositories multiple times
    server.route({
      method: 'GET',
      path: '/test-caching',
      handler: (request) => {
        // Access each repository twice to exercise caching
        const first = {
          formSubmissions: request.repositories.formSubmissions,
          wasteRecords: request.repositories.wasteRecords,
          wasteBalances: request.repositories.wasteBalances,
          systemLogs: request.repositories.systemLogs
        }
        const second = {
          formSubmissions: request.repositories.formSubmissions,
          wasteRecords: request.repositories.wasteRecords,
          wasteBalances: request.repositories.wasteBalances,
          systemLogs: request.repositories.systemLogs
        }
        return {
          formSubmissionsSame: first.formSubmissions === second.formSubmissions,
          wasteRecordsSame: first.wasteRecords === second.wasteRecords,
          wasteBalancesSame: first.wasteBalances === second.wasteBalances,
          systemLogsSame: first.systemLogs === second.systemLogs
        }
      }
    })

    const response = await server.inject({
      method: 'GET',
      url: '/test-caching'
    })

    const payload = JSON.parse(response.payload)
    expect(payload.formSubmissionsSame).toBe(true)
    expect(payload.wasteRecordsSame).toBe(true)
    expect(payload.wasteBalancesSame).toBe(true)
    expect(payload.systemLogsSame).toBe(true)
  })
})
