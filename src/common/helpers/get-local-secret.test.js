import fs from 'fs'
import { config } from '#root/config.js'
import { getLocalSecret } from './get-local-secret.js'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '../enums/event.js'

const mockLoggerError = vi.fn()
const mockLoggerDebug = vi.fn()
const secretFixture = 'secret'

vi.mock('fs')
vi.mock('./logging/logger.js', async (importOriginal) => {
  const actual = /** @type {Record<string, unknown>} */ (await importOriginal())
  return {
    ...actual,
    logger: {
      info: vi.fn(),
      error: (...args) => mockLoggerError(...args),
      warn: vi.fn(),
      debug: (...args) => mockLoggerDebug(...args)
    }
  }
})

describe('getLocalSecret', () => {
  const configKey = 'govukNotifyApiKeyPath'

  afterEach(() => {
    config.reset(configKey)
    vi.clearAllMocks()
  })

  it('returns a value from file', () => {
    config.set(configKey, 'path/to/secret/file')
    vi.mocked(fs).readFileSync.mockReturnValueOnce(secretFixture)

    expect(getLocalSecret(configKey)).toEqual(secretFixture)
  })

  it('returns null if secret file not found', () => {
    config.set(configKey, 'path/to/secret/file')
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

  it('returns null when the configured path is empty', () => {
    const result = getLocalSecret(configKey)

    expect(result).toBeNull()
    expect(mockLoggerError).toHaveBeenCalled()
  })

  it('logs at debug (not error) when the secret file is missing (ENOENT)', () => {
    config.set(configKey, 'path/to/secret/file')
    const error = Object.assign(new Error('ENOENT: no such file'), {
      code: 'ENOENT'
    })
    vi.mocked(fs).readFileSync.mockImplementationOnce(() => {
      throw error
    })

    const result = getLocalSecret(configKey)

    expect(result).toBeNull()
    expect(mockLoggerError).not.toHaveBeenCalled()
    expect(mockLoggerDebug).toHaveBeenCalledWith({
      message: `Local secret not present for config key: ${configKey}`,
      event: {
        category: LOGGING_EVENT_CATEGORIES.SECRET,
        action: LOGGING_EVENT_ACTIONS.NOT_FOUND
      }
    })
  })
})
