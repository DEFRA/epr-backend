import fs from 'fs'
import { getLocalSecret } from './get-local-secret.js'

const mockLoggerInfo = jest.fn()
const mockLoggerError = jest.fn()
const mockLoggerWarn = jest.fn()
const secretFixture = 'secret'

jest.mock('fs')
jest.mock('./logging/logger.js', () => ({
  createLogger: () => ({
    info: (...args) => mockLoggerInfo(...args),
    error: (...args) => mockLoggerError(...args),
    warn: (...args) => mockLoggerWarn(...args)
  })
}))

describe('getLocalSecret', () => {
  const secretName = 'SECRET_NAME'
  const originalProcessEnv = { ...process.env }

  beforeEach(() => {
    jest.resetModules()
    process.env.SECRET_NAME = 'path/to/secret/file'
  })

  afterEach(() => {
    jest.clearAllMocks()
    process.env = originalProcessEnv
  })

  it('returns a value from file', async () => {
    jest.mocked(fs).readFileSync.mockImplementationOnce(() => secretFixture)
    expect(getLocalSecret(secretName)).toEqual(secretFixture)
  })

  it('returns a null if secret not found', async () => {
    const error = new Error('file not found')
    jest.mocked(fs).readFileSync.mockImplementationOnce(() => {
      throw error
    })
    const result = getLocalSecret(secretName)
    expect(result).toEqual(null)
    expect(mockLoggerError).toHaveBeenCalledWith(
      `An error occurred while trying to read the secret: ${secretName}.\n${error}`
    )
  })
})
