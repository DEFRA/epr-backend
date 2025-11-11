import { validateConfig } from './validate-config.js'

describe('#validateConfig', () => {
  test('Should not throw with valid userRoles JSON', () => {
    const mockConfig = {
      get: vi.fn().mockReturnValue('{"admin": ["user@example.com"]}')
    }

    expect(() => validateConfig(mockConfig)).not.toThrow()
  })

  test('Should throw with malformed userRoles JSON', () => {
    const mockConfig = {
      get: vi.fn().mockReturnValue('{"admin": ["user@example.com"')
    }

    expect(() => validateConfig(mockConfig)).toThrow(
      'Invalid userRoles configuration: malformed JSON'
    )
  })

  test('Should throw with invalid JSON syntax', () => {
    const mockConfig = {
      get: vi.fn().mockReturnValue('not valid json at all')
    }

    expect(() => validateConfig(mockConfig)).toThrow(
      'Invalid userRoles configuration: malformed JSON'
    )
  })

  test('Should include original error as cause', () => {
    const mockConfig = {
      get: vi.fn().mockReturnValue('{"invalid": ')
    }

    try {
      validateConfig(mockConfig)
      // Should not reach here
      expect(true).toBe(false)
    } catch (error) {
      expect(error.message).toBe(
        'Invalid userRoles configuration: malformed JSON'
      )
      expect(error.cause).toBeInstanceOf(Error)
    }
  })
})
