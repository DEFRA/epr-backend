import { describe, it, expect } from 'vitest'

import { buildJoiSchema, buildKeyTree, joiTypeFor } from './log-schema-build.js'

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
    ['keyword', 'string'],
    ['text', 'string'],
    ['ip', 'string'],
    ['long', 'number'],
    ['date', 'string'],
    ['boolean', 'boolean'],
    ['float', 'number'],
    ['double', 'number']
  ])('should map %s to a Joi schema of type %s', (osType, joiType) => {
    expect(joiTypeFor(osType).type).toBe(joiType)
  })

  it('should fall back to a Joi.string() schema for unknown types', () => {
    expect(joiTypeFor('whatever').type).toBe('string')
  })

  it('should produce an integer-only number schema for long', () => {
    const schema = joiTypeFor('long')

    expect(schema.validate(1.5).error).toBeDefined()
    expect(schema.validate(1).error).toBeUndefined()
  })

  it('should produce an isoDate string schema for date', () => {
    const schema = joiTypeFor('date')

    expect(schema.validate('not-iso').error).toBeDefined()
    expect(schema.validate('2026-04-27T13:00:00.000Z').error).toBeUndefined()
  })
})

describe('buildJoiSchema', () => {
  it('should build a flat Joi.object that accepts known fields', () => {
    const tree = {
      message: { __type: 'keyword' },
      error: { code: { __type: 'keyword' } }
    }
    const schema = buildJoiSchema(tree)

    expect(schema.validate({ message: 'hi' }).error).toBeUndefined()
    expect(
      schema.validate({ message: 'hi', error: { code: 'X' } }).error
    ).toBeUndefined()
  })

  it('should reject top-level unknown keys', () => {
    const schema = buildJoiSchema({ message: { __type: 'keyword' } })

    expect(
      schema.validate({ message: 'hi', extra: 'x' }).error?.message
    ).toMatch(/extra/)
  })

  it('should reject nested unknown keys', () => {
    const schema = buildJoiSchema({
      error: { code: { __type: 'keyword' } }
    })

    expect(
      schema.validate({ error: { code: 'X', extra: 'y' } }).error?.message
    ).toMatch(/extra/)
  })

  it('should enforce types on leaf fields', () => {
    const schema = buildJoiSchema({
      http: {
        response: { status_code: { __type: 'long' } }
      }
    })

    expect(
      schema.validate({ http: { response: { status_code: 'four-hundred' } } })
        .error
    ).toBeDefined()
    expect(
      schema.validate({ http: { response: { status_code: 400 } } }).error
    ).toBeUndefined()
  })
})
