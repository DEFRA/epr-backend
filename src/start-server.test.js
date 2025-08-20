import hapi from '@hapi/hapi'

import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from './common/enums/event.js'
import { getConfig } from './config.js'

const mockLoggerInfo = vi.fn(console.log)
const mockLoggerError = vi.fn(console.error)
const mockLoggerWarn = vi.fn(console.warn)

const mockHapiLoggerInfo = vi.fn()
const mockHapiLoggerError = vi.fn()

const mockEnabledAuditing = vi.fn()

const configOverrides = { audit: { isEnabled: true }, port: 3098 }

vi.mock('./config.js', async (importOriginal) => {
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
            case 'port':
              return configOverrides.port
            default:
              originalConfig.get(item)
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

vi.mock('./common/helpers/logging/logger.js', () => ({
  createLogger: () => ({
    info: (...args) => mockLoggerInfo(...args),
    error: (...args) => mockLoggerError(...args),
    warn: (...args) => mockLoggerWarn(...args)
  })
}))

vi.mock('./common/helpers/mongodb.js')

vi.mock('@defra/cdp-auditing', () => ({
  enableAuditing: (...args) => mockEnabledAuditing(...args)
}))

describe('#startServer', () => {
  let createServerSpy
  let hapiServerSpy
  let startServerImport
  let createServerImport
  let server

  beforeAll(async () => {
    createServerImport = await import('./server.js')
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
          /^Server started successfully at http:\/\/localhost:[0-9]+/
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
            case 'port':
              return configOverrides.port
            default:
              config.get(item)
          }
        }
      }))

      await server.stop()
      server = await startServerImport.startServer()

      expect(mockEnabledAuditing).toHaveBeenCalledWith(false)
    })
  })

  describe('When server start fails', async () => {
    beforeEach(async () => {
      await server.stop()
      createServerSpy.mockRejectedValue(new Error('Server failed to start'))
      server = await startServerImport.startServer()
    })

    test('Should log failed startup message', async () => {
      expect(mockLoggerError).toHaveBeenCalledWith(
        Error('Server failed to start'),
        {
          message: 'Server failed to start',
          event: {
            category: LOGGING_EVENT_CATEGORIES.SERVER,
            action: LOGGING_EVENT_ACTIONS.START_FAILURE
          }
        }
      )
    })
  })
})
