import { describe, test, expect, vi } from 'vitest'

import { validateConfig } from './validate-config.js'

const ROLE_KEYS = [
  'roles.serviceMaintainers',
  'roles.serviceMaintainersWrite',
  'roles.support'
]

function mockConfigForKeys(values) {
  return {
    get: vi.fn((key) => values[key])
  }
}

function mockConfigAllValid() {
  return mockConfigForKeys({
    'roles.serviceMaintainers': '["user1", "user2"]',
    'roles.serviceMaintainersWrite': '["writer1"]',
    'roles.support': '[]'
  })
}

describe('#validateConfig', () => {
  describe('when all role lists are valid', () => {
    test('does not throw when all keys are valid JSON arrays', () => {
      expect(() => validateConfig(mockConfigAllValid())).not.toThrow()
    })

    test('does not throw when all lists are empty', () => {
      const mockConfig = mockConfigForKeys({
        'roles.serviceMaintainers': '[]',
        'roles.serviceMaintainersWrite': '[]',
        'roles.support': '[]'
      })

      expect(() => validateConfig(mockConfig)).not.toThrow()
    })

    test('does not throw for arrays of objects or mixed types', () => {
      const mockConfig = mockConfigForKeys({
        'roles.serviceMaintainers':
          '[{"id": 1, "name": "user1"}, {"id": 2, "name": "user2"}]',
        'roles.serviceMaintainersWrite': '[1, "string", true, null]',
        'roles.support': '[]'
      })

      expect(() => validateConfig(mockConfig)).not.toThrow()
    })

    test('reads all three role list keys', () => {
      const mockConfig = mockConfigAllValid()

      validateConfig(mockConfig)

      for (const key of ROLE_KEYS) {
        expect(mockConfig.get).toHaveBeenCalledWith(key)
      }
      expect(mockConfig.get).toHaveBeenCalledTimes(ROLE_KEYS.length)
    })
  })

  describe('when a role list contains malformed JSON', () => {
    test.each(ROLE_KEYS)('throws naming the offending key (%s)', (key) => {
      const values = {
        'roles.serviceMaintainers': '[]',
        'roles.serviceMaintainersWrite': '[]',
        'roles.support': '[]'
      }
      values[key] = 'not valid json'

      const mockConfig = mockConfigForKeys(values)

      expect(() => validateConfig(mockConfig)).toThrow(
        `Invalid ${key} configuration: malformed JSON`
      )
    })

    test('throws when JSON is incomplete', () => {
      const mockConfig = mockConfigForKeys({
        'roles.serviceMaintainers': '["user1", "user2"',
        'roles.serviceMaintainersWrite': '[]',
        'roles.support': '[]'
      })

      expect(() => validateConfig(mockConfig)).toThrow(
        'Invalid roles.serviceMaintainers configuration: malformed JSON'
      )
    })
  })

  describe('when a role list is not an array', () => {
    test.each(ROLE_KEYS)('throws naming the offending key (%s)', (key) => {
      const values = {
        'roles.serviceMaintainers': '[]',
        'roles.serviceMaintainersWrite': '[]',
        'roles.support': '[]'
      }
      values[key] = '{"key": "value"}'

      const mockConfig = mockConfigForKeys(values)

      expect(() => validateConfig(mockConfig)).toThrow(
        `Invalid ${key} configuration: not an array`
      )
    })

    test.each(['"just a string"', '123', 'true', 'null'])(
      'throws when serviceMaintainers value is %s',
      (jsonValue) => {
        const mockConfig = mockConfigForKeys({
          'roles.serviceMaintainers': jsonValue,
          'roles.serviceMaintainersWrite': '[]',
          'roles.support': '[]'
        })

        expect(() => validateConfig(mockConfig)).toThrow(
          'Invalid roles.serviceMaintainers configuration: not an array'
        )
      }
    )
  })

  describe('edge cases', () => {
    test('handles array with nested arrays', () => {
      const mockConfig = mockConfigForKeys({
        'roles.serviceMaintainers': '[["nested", "array"], ["another", "one"]]',
        'roles.serviceMaintainersWrite': '[]',
        'roles.support': '[]'
      })

      expect(() => validateConfig(mockConfig)).not.toThrow()
    })

    test('handles whitespace in JSON', () => {
      const mockConfig = mockConfigForKeys({
        'roles.serviceMaintainers': `
          [
            "user1",
            "user2",
            "user3"
          ]
        `,
        'roles.serviceMaintainersWrite': '[]',
        'roles.support': '[]'
      })

      expect(() => validateConfig(mockConfig)).not.toThrow()
    })
  })
})
