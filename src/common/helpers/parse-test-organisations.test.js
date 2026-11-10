import { describe, test, expect, vi } from 'vitest'

vi.mock('#root/config.js', () => ({
  config: {
    get: vi.fn().mockReturnValue('[]')
  }
}))

const { config } = await import('#root/config.js')
const { parseTestOrganisationNumbers } =
  await import('./parse-test-organisations.js')

describe('#parseTestOrganisationNumbers', () => {
  test('reads the organisation number of each entry', () => {
    config.get.mockReturnValue('[999999, 888888]')

    expect(parseTestOrganisationNumbers()).toEqual(['999999', '888888'])
  })

  test('reads string entries as organisation numbers', () => {
    config.get.mockReturnValue('["999999", "888888"]')

    expect(parseTestOrganisationNumbers()).toEqual(['999999', '888888'])
  })

  test('filters out non-finite values', () => {
    config.get.mockReturnValue('[999999, "not-a-number", null]')

    expect(parseTestOrganisationNumbers()).toEqual(['999999'])
  })

  test('filters out values that are not whole numbers', () => {
    config.get.mockReturnValue('[999999, 5.5, 1e21]')

    expect(parseTestOrganisationNumbers()).toEqual(['999999'])
  })

  test('returns empty array for empty JSON array', () => {
    config.get.mockReturnValue('[]')

    expect(parseTestOrganisationNumbers()).toEqual([])
  })

  test('throws on malformed JSON', () => {
    config.get.mockReturnValue('not valid json')

    expect(() => parseTestOrganisationNumbers()).toThrow(
      'Invalid testOrganisations configuration: malformed JSON'
    )
  })

  test('includes original error as cause when JSON parsing fails', () => {
    config.get.mockReturnValue('not valid json')

    let thrownError
    try {
      parseTestOrganisationNumbers()
    } catch (e) {
      thrownError = e
    }

    expect(thrownError?.cause).toBeInstanceOf(SyntaxError)
  })

  test('throws when value is not an array', () => {
    config.get.mockReturnValue('{"key": "value"}')

    expect(() => parseTestOrganisationNumbers()).toThrow(
      'Invalid testOrganisations configuration: not an array'
    )
  })

  test('throws when value is a number', () => {
    config.get.mockReturnValue('123')

    expect(() => parseTestOrganisationNumbers()).toThrow(
      'Invalid testOrganisations configuration: not an array'
    )
  })
})

describe('TEST_ORGANISATION_NUMBERS', () => {
  test('holds the organisation number of each test organisation', async () => {
    vi.resetModules()
    const { config: freshConfig } = await import('#root/config.js')
    freshConfig.get.mockReturnValue('[999999, "888888", 999999]')

    const { TEST_ORGANISATION_NUMBERS } =
      await import('./parse-test-organisations.js')

    expect(TEST_ORGANISATION_NUMBERS).toEqual(new Set(['999999', '888888']))
  })
})
