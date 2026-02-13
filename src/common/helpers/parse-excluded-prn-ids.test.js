import { describe, test, expect, vi } from 'vitest'

vi.mock('#root/config.js', () => ({
  config: {
    get: vi.fn().mockReturnValue('[]')
  }
}))

const { config } = await import('#root/config.js')
const { parseExcludedPrnIds } = await import('./parse-excluded-prn-ids.js')

describe('#parseExcludedPrnIds', () => {
  test('parses valid string array', () => {
    config.get.mockReturnValue(
      '["507f1f77bcf86cd799439011", "507f1f77bcf86cd799439012"]'
    )

    expect(parseExcludedPrnIds()).toEqual([
      '507f1f77bcf86cd799439011',
      '507f1f77bcf86cd799439012'
    ])
  })

  test('returns empty array for empty JSON array', () => {
    config.get.mockReturnValue('[]')

    expect(parseExcludedPrnIds()).toEqual([])
  })

  test('throws on malformed JSON', () => {
    config.get.mockReturnValue('not valid json')

    expect(() => parseExcludedPrnIds()).toThrow(
      'Invalid excludedPrnIds configuration: malformed JSON'
    )
  })

  test('includes original error as cause when JSON parsing fails', () => {
    config.get.mockReturnValue('not valid json')

    try {
      parseExcludedPrnIds()
      expect.fail('Should have thrown an error')
    } catch (error) {
      expect(error.cause).toBeInstanceOf(SyntaxError)
    }
  })

  test('throws when value is not an array', () => {
    config.get.mockReturnValue('{"key": "value"}')

    expect(() => parseExcludedPrnIds()).toThrow(
      'Invalid excludedPrnIds configuration: not an array'
    )
  })

  test('filters out non-string values', () => {
    config.get.mockReturnValue('["507f1f77bcf86cd799439011", 123, null, true]')

    expect(parseExcludedPrnIds()).toEqual(['507f1f77bcf86cd799439011'])
  })

  test('filters out empty strings', () => {
    config.get.mockReturnValue('["507f1f77bcf86cd799439011", ""]')

    expect(parseExcludedPrnIds()).toEqual(['507f1f77bcf86cd799439011'])
  })
})
