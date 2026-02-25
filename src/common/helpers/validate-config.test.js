import { describe, test, expect, vi } from 'vitest'

import { validateConfig } from './validate-config.js'

describe('#validateConfig', () => {
  describe('when roles.serviceMaintainers is valid', () => {
    test('does not throw when provided with a valid JSON array', () => {
      const mockConfig = {
        get: vi.fn().mockReturnValue('["user1", "user2", "user3"]')
      }

      expect(() => validateConfig(mockConfig)).not.toThrow()
      expect(mockConfig.get).toHaveBeenCalledWith('roles.serviceMaintainers')
    })

    test('does not throw when provided with an empty array', () => {
      const mockConfig = {
        get: vi.fn().mockReturnValue('[]')
      }

      expect(() => validateConfig(mockConfig)).not.toThrow()
    })

    test('does not throw when provided with an array of objects', () => {
      const mockConfig = {
        get: vi
          .fn()
          .mockReturnValue(
            '[{"id": 1, "name": "user1"}, {"id": 2, "name": "user2"}]'
          )
      }

      expect(() => validateConfig(mockConfig)).not.toThrow()
    })

    test('does not throw when provided with an array containing mixed types', () => {
      const mockConfig = {
        get: vi.fn().mockReturnValue('[1, "string", true, null]')
      }

      expect(() => validateConfig(mockConfig)).not.toThrow()
    })
  })

  describe('when roles.serviceMaintainers contains malformed JSON', () => {
    test('throws error with cause when JSON is invalid', () => {
      const mockConfig = {
        get: vi.fn().mockReturnValue('not valid json')
      }

      expect(() => validateConfig(mockConfig)).toThrow(
        'Invalid roles.serviceMaintainers configuration: malformed JSON'
      )
    })

    test('throws error with cause when JSON is incomplete', () => {
      const mockConfig = {
        get: vi.fn().mockReturnValue('["user1", "user2"')
      }

      expect(() => validateConfig(mockConfig)).toThrow(
        'Invalid roles.serviceMaintainers configuration: malformed JSON'
      )
    })

    test('throws error with cause when JSON has trailing comma', () => {
      const mockConfig = {
        get: vi.fn().mockReturnValue('["user1", "user2",]')
      }

      expect(() => validateConfig(mockConfig)).toThrow(
        'Invalid roles.serviceMaintainers configuration: malformed JSON'
      )
    })

    test('includes original error as cause when JSON parsing fails', () => {
      const mockConfig = {
        get: vi.fn().mockReturnValue('invalid json')
      }

      let thrownError
      try {
        validateConfig(mockConfig)
      } catch (e) {
        thrownError = e
      }

      expect(thrownError?.message).toBe(
        'Invalid roles.serviceMaintainers configuration: malformed JSON'
      )
      expect(thrownError?.cause).toBeDefined()
      expect(thrownError?.cause).toBeInstanceOf(SyntaxError)
    })
  })

  describe('when roles.serviceMaintainers is not an array', () => {
    test('throws error when value is a string', () => {
      const mockConfig = {
        get: vi.fn().mockReturnValue('"just a string"')
      }

      expect(() => validateConfig(mockConfig)).toThrow(
        'Invalid roles.serviceMaintainers configuration: not an array'
      )
    })

    test('throws error when value is an object', () => {
      const mockConfig = {
        get: vi.fn().mockReturnValue('{"key": "value"}')
      }

      expect(() => validateConfig(mockConfig)).toThrow(
        'Invalid roles.serviceMaintainers configuration: not an array'
      )
    })

    test('throws error when value is a number', () => {
      const mockConfig = {
        get: vi.fn().mockReturnValue('123')
      }

      expect(() => validateConfig(mockConfig)).toThrow(
        'Invalid roles.serviceMaintainers configuration: not an array'
      )
    })

    test('throws error when value is boolean', () => {
      const mockConfig = {
        get: vi.fn().mockReturnValue('true')
      }

      expect(() => validateConfig(mockConfig)).toThrow(
        'Invalid roles.serviceMaintainers configuration: not an array'
      )
    })

    test('throws error when value is null', () => {
      const mockConfig = {
        get: vi.fn().mockReturnValue('null')
      }

      expect(() => validateConfig(mockConfig)).toThrow(
        'Invalid roles.serviceMaintainers configuration: not an array'
      )
    })
  })

  describe('edge cases', () => {
    test('handles array with nested arrays', () => {
      const mockConfig = {
        get: vi
          .fn()
          .mockReturnValue('[["nested", "array"], ["another", "one"]]')
      }

      expect(() => validateConfig(mockConfig)).not.toThrow()
    })

    test('handles array with whitespace in JSON', () => {
      const mockConfig = {
        get: vi.fn().mockReturnValue(`
          [
            "user1",
            "user2",
            "user3"
          ]
        `)
      }

      expect(() => validateConfig(mockConfig)).not.toThrow()
    })

    test('calls config.get with correct parameter', () => {
      const mockConfig = {
        get: vi.fn().mockReturnValue('[]')
      }

      validateConfig(mockConfig)

      expect(mockConfig.get).toHaveBeenCalledTimes(1)
      expect(mockConfig.get).toHaveBeenCalledWith('roles.serviceMaintainers')
    })
  })
})
