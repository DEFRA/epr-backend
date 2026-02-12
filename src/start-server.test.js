import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import hapi from '@hapi/hapi'
import { afterAll, beforeAll, beforeEach, describe, expect, vi } from 'vitest'

import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/event.js'

import { getConfig } from '#root/config.js'
import { it as test } from '#vite/fixtures/server-with-db.js'

const mockLoggerInfo = vi.fn()
const mockLoggerError = vi.fn()
const mockLoggerWarn = vi.fn()

const mockHapiLoggerInfo = vi.fn()
const mockHapiLoggerError = vi.fn()

const mockEnabledAuditing = vi.fn()

const configOverrides = {
  audit: { isEnabled: true },
  host: '0.0.0.0',
  port: 3098
}

vi.mock('#root/config.js', async (importOriginal) => {
  const configImportOriginal = await importOriginal()

  return {
    ...configImportOriginal,
    getConfig: vi.fn((overrides) => {
      const originalConfig = configImportOriginal.getConfig(overrides)

      return {
        ...originalConfig,
        get: (item) => {
          switch (item) {
            case 'audit':
              return configOverrides.audit
            case 'host':
              return configOverrides.host
            case 'port':
              return configOverrides.port
            default:
              return originalConfig.get(item)
          }
        }
      }
    })
  }
})

vi.mock('hapi-pino', () => ({
  default: {
    register: (server) => {
      server.decorate('server', 'logger', {
        info: mockHapiLoggerInfo,
        error: mockHapiLoggerError
      })
    },
    name: 'mock-hapi-pino'
  }
}))

vi.mock('#common/helpers/logging/logger.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    logger: {
      info: (...args) => mockLoggerInfo(...args),
      error: (...args) => mockLoggerError(...args),
      warn: (...args) => mockLoggerWarn(...args)
    }
  }
})

vi.mock('#common/helpers/plugins/mongo-db-plugin.js', () => ({
  mongoDbPlugin: {
    plugin: {
      name: 'mongodb',
      version: '1.0.0',
      register: (server) => {
        const mockCollection = {
          createIndex: vi.fn().mockResolvedValue(undefined),
          countDocuments: vi.fn().mockResolvedValue(0),
          updateOne: vi.fn().mockResolvedValue(undefined),
          indexes: vi.fn().mockResolvedValue([])
        }
        server.decorate('server', 'db', {
          collection: vi.fn().mockReturnValue(mockCollection)
        })
        server.decorate('server', 'mongoClient', {})
        server.decorate('server', 'locker', {})
      }
    }
  }
}))

vi.mock('@defra/hapi-secure-context')

vi.mock('#server/queue-consumer/queue-consumer.plugin.js', () => ({
  commandQueueConsumerPlugin: {
    name: 'command-queue-consumer',
    version: '1.0.0',
    register: vi.fn()
  }
}))

vi.mock('@defra/cdp-auditing', () => ({
  enableAuditing: (...args) => mockEnabledAuditing(...args)
}))

describe('#startServer', () => {
  let createServerSpy
  let hapiServerSpy
  let startServerImport
  let createServerImport
  let server
  setupAuthContext()

  beforeAll(async () => {
    createServerImport = await import('#server/server.js')
    startServerImport = await import('./start-server.js')

    createServerSpy = vi.spyOn(createServerImport, 'createServer')
    hapiServerSpy = vi.spyOn(hapi, 'server')

    server = await startServerImport.startServer()
  })

  afterAll(async () => {
    vi.resetAllMocks()
  })

  describe('When server starts', () => {
    beforeEach(async () => {
      await server.stop()
      server = await startServerImport.startServer()
    })

    test('Should start up server as expected', async () => {
      expect(createServerSpy).toHaveBeenCalled()
      expect(hapiServerSpy).toHaveBeenCalled()
      expect(mockHapiLoggerInfo).toHaveBeenCalledWith({
        message: expect.stringMatching(
          /^Server started successfully at http:\/\/0.0.0.0:[0-9]+ with Auditing: on/
        ),
        event: {
          category: LOGGING_EVENT_CATEGORIES.SERVER,
          action: LOGGING_EVENT_ACTIONS.START_SUCCESS
        }
      })
    })

    test('Should enable auditing by default', async () => {
      expect(mockEnabledAuditing).toHaveBeenCalledWith(true)
    })

    test('Should disable auditing if audit.isEnabled config is false', async () => {
      const config = getConfig()

      getConfig.mockImplementationOnce(() => ({
        ...config,
        get: (item) => {
          switch (item) {
            case 'audit':
              return {
                ...configOverrides.audit,
                isEnabled: false
              }
            case 'host':
              return configOverrides.host
            case 'port':
              return configOverrides.port
            default:
              return config.get(item)
          }
        }
      }))

      await server.stop()
      server = await startServerImport.startServer()

      expect(mockEnabledAuditing).toHaveBeenCalledWith(false)
      expect(mockHapiLoggerInfo).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringMatching(
            /^Server started successfully at http:\/\/0.0.0.0:[0-9]+ with Auditing: off/
          )
        })
      )
    })
  })

  describe('When server start fails', async () => {
    beforeEach(async () => {
      await server.stop()
      createServerSpy.mockRejectedValue(new Error('Server failed to start'))
    })

    test('Should log failed startup message and throw error', async () => {
      await expect(startServerImport.startServer()).rejects.toThrow(
        'Server failed to start'
      )

      expect(mockLoggerError).toHaveBeenCalledWith({
        err: expect.any(Error),
        message: 'Server failed to start',
        event: {
          category: LOGGING_EVENT_CATEGORIES.SERVER,
          action: LOGGING_EVENT_ACTIONS.START_FAILURE
        }
      })
    })
  })
})
