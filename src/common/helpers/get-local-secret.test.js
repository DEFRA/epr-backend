import fs from 'fs'
import { getLocalSecret } from './get-local-secret.js'

const mockLoggerInfo = vi.fn()
const mockLoggerError = vi.fn()
const mockLoggerWarn = vi.fn()
const secretFixture = 'secret'

vi.mock('fs')
vi.mock('./logging/logger.js', () => ({
  createLogger: () => ({
    info: (...args) => mockLoggerInfo(...args),
    error: (...args) => mockLoggerError(...args),
    warn: (...args) => mockLoggerWarn(...args)
  })
}))

describe('getLocalSecret', () => {
  const secretName = 'SECRET_NAME'

  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv(secretName, 'path/to/secret/file')
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
  })

  it('returns a value from file', async () => {
    vi.mocked(fs).readFileSync.mockImplementationOnce(() => secretFixture)
    expect(getLocalSecret(secretName)).toEqual(secretFixture)
  })

  it('returns a null if secret not found', async () => {
    const error = new Error('file not found')
    vi.mocked(fs).readFileSync.mockImplementationOnce(() => {
      throw error
    })
    const result = getLocalSecret(secretName)
    expect(result).toEqual(null)
    expect(mockLoggerError).toHaveBeenCalledWith(
      `An error occurred while trying to read the secret: ${secretName}.\n${error}`
    )
  })
})
