import { describe, it, expect } from 'vitest'
import { parseIncludeKeys, parseFieldTypes } from './parse.js'

describe('parseIncludeKeys', () => {
  it('should extract quoted strings from the include_keys default block', () => {
    const tf = `
variable "include_keys" {
  type = list(string)
  default = [
    "@timestamp",
    "error/code",
    "event/action"
  ]
}
`

    expect(parseIncludeKeys(tf)).toEqual([
      '@timestamp',
      'error/code',
      'event/action'
    ])
  })

  it('should ignore other variable blocks', () => {
    const tf = `
variable "other" {
  default = ["a", "b"]
}
variable "include_keys" {
  default = [
    "x",
    "y"
  ]
}
variable "trailing" {
  default = ["z"]
}
`

    expect(parseIncludeKeys(tf)).toEqual(['x', 'y'])
  })

  it('should throw when include_keys variable is missing', () => {
    expect(() => parseIncludeKeys('variable "other" {}')).toThrow(
      /include_keys/
    )
  })
})

describe('parseFieldTypes', () => {
  it('should walk nested properties to a flat dotted-path map', () => {
    const json = {
      template: {
        mappings: {
          properties: {
            '@timestamp': { type: 'date' },
            error: {
              properties: {
                code: { type: 'keyword' },
                message: { type: 'keyword' }
              }
            },
            http: {
              properties: {
                response: {
                  properties: {
                    status_code: { type: 'long' }
                  }
                }
              }
            }
          }
        }
      }
    }

    expect(parseFieldTypes(json)).toEqual({
      '@timestamp': 'date',
      'error.code': 'keyword',
      'error.message': 'keyword',
      'http.response.status_code': 'long'
    })
  })

  it('should skip nodes that are pure containers without a type', () => {
    const json = {
      template: {
        mappings: {
          properties: {
            error: { properties: { code: { type: 'keyword' } } }
          }
        }
      }
    }
    const types = parseFieldTypes(json)

    expect(types).toEqual({ 'error.code': 'keyword' })
    expect(types.error).toBeUndefined()
  })
})
