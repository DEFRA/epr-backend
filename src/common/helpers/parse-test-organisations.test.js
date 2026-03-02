import { describe, test, expect, vi } from 'vitest'

vi.mock('#root/config.js', () => ({
  config: {
    get: vi.fn().mockReturnValue('[]')
  }
}))

const { config } = await import('#root/config.js')
const { parseTestOrganisationIds } =
  await import('./parse-test-organisations.js')

describe('#parseTestOrganisationIds', () => {
  test('parses valid numeric array', () => {
    config.get.mockReturnValue('[999999, 888888]')

    expect(parseTestOrganisationIds()).toEqual([999999, 888888])
  })

  test('normalises string entries to numbers', () => {
    config.get.mockReturnValue('["999999", "888888"]')

    expect(parseTestOrganisationIds()).toEqual([999999, 888888])
  })

  test('filters out non-finite values', () => {
    config.get.mockReturnValue('[999999, "not-a-number", null]')

    expect(parseTestOrganisationIds()).toEqual([999999])
  })

  test('returns empty array for empty JSON array', () => {
    config.get.mockReturnValue('[]')

    expect(parseTestOrganisationIds()).toEqual([])
  })

  test('throws on malformed JSON', () => {
    config.get.mockReturnValue('not valid json')

    expect(() => parseTestOrganisationIds()).toThrow(
      'Invalid testOrganisations configuration: malformed JSON'
    )
  })

  test('includes original error as cause when JSON parsing fails', () => {
    config.get.mockReturnValue('not valid json')

    let thrownError
    try {
      parseTestOrganisationIds()
    } catch (e) {
      thrownError = e
    }

    expect(thrownError?.cause).toBeInstanceOf(SyntaxError)
  })

  test('throws when value is not an array', () => {
    config.get.mockReturnValue('{"key": "value"}')

    expect(() => parseTestOrganisationIds()).toThrow(
      'Invalid testOrganisations configuration: not an array'
    )
  })

  test('throws when value is a number', () => {
    config.get.mockReturnValue('123')

    expect(() => parseTestOrganisationIds()).toThrow(
      'Invalid testOrganisations configuration: not an array'
    )
  })
})
