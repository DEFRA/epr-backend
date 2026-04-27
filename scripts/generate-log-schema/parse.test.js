import { describe, it, expect } from 'vitest'
import {
  parseIncludeKeys,
  parseFieldTypes,
  buildKeyTree,
  joiTypeFor
} from './parse.js'

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

describe('buildKeyTree', () => {
  it('should convert slash- and dot-paths into a nested tree, dedupe, and attach types', () => {
    const keys = [
      'message',
      'error/code',
      'error.code',
      'http/response/status_code'
    ]
    const types = {
      message: 'keyword',
      'error.code': 'keyword',
      'http.response.status_code': 'long'
    }

    expect(buildKeyTree(keys, types)).toEqual({
      message: { __type: 'keyword' },
      error: {
        code: { __type: 'keyword' }
      },
      http: {
        response: {
          status_code: { __type: 'long' }
        }
      }
    })
  })

  it('should fall back to keyword when a key is missing from types', () => {
    const tree = buildKeyTree(['message'], {})

    expect(tree.message.__type).toBe('keyword')
  })
})

describe('joiTypeFor', () => {
  it.each([
    ['keyword', 'Joi.string()'],
    ['text', 'Joi.string()'],
    ['ip', 'Joi.string()'],
    ['long', 'Joi.number().integer()'],
    ['date', 'Joi.string().isoDate()'],
    ['boolean', 'Joi.boolean()'],
    ['float', 'Joi.number()'],
    ['double', 'Joi.number()']
  ])('should map %s to %s', (osType, joi) => {
    expect(joiTypeFor(osType)).toBe(joi)
  })

  it('should fall back to Joi.string() for unknown types', () => {
    expect(joiTypeFor('whatever')).toBe('Joi.string()')
  })
})
