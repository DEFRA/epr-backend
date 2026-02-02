import fs from 'fs'
import { getLocalSecret } from './get-local-secret.js'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '../enums/event.js'

const mockLoggerError = vi.fn()
const secretFixture = 'secret'

vi.mock('fs')
vi.mock('./logging/logger.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    logger: {
      info: vi.fn(),
      error: (...args) => mockLoggerError(...args),
      warn: vi.fn()
    }
  }
})
vi.mock('#root/config.js', () => ({
  config: {
    get: vi.fn((key) => {
      const values = {
        'some.configKey': 'path/to/secret/file',
        log: {
          isEnabled: true,
          level: 'info',
          format: 'pino-pretty',
          redact: []
        },
        serviceName: 'test-service',
        serviceVersion: '1.0.0',
        cdpEnvironment: 'test'
      }
      return values[key]
    })
  }
}))

describe('getLocalSecret', () => {
  const configKey = 'some.configKey'

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('returns a value from file', () => {
    vi.mocked(fs).readFileSync.mockReturnValueOnce(secretFixture)
    expect(getLocalSecret(configKey)).toEqual(secretFixture)
  })

  it('returns null if secret file not found', () => {
    const error = new Error('file not found')
    vi.mocked(fs).readFileSync.mockImplementationOnce(() => {
      throw error
    })
    const result = getLocalSecret(configKey)
    expect(result).toEqual(null)
    expect(mockLoggerError).toHaveBeenCalledWith({
      err: error,
      message: `An error occurred while trying to read the secret: ${configKey}.\n${error}`,
      event: {
        category: LOGGING_EVENT_CATEGORIES.SECRET,
        action: LOGGING_EVENT_ACTIONS.READ_ERROR
      }
    })
  })

  it('returns null if config key is not set', () => {
    const result = getLocalSecret('nonexistent.configKey')
    expect(result).toBeNull()
    expect(mockLoggerError).toHaveBeenCalled()
  })
})
