import { describe, it, expect } from 'vitest'
import Boom from '@hapi/boom'
import { enrichBoom, badRequest, conflict, internal } from './enrich-boom.js'

describe('enrichBoom', () => {
  it('should attach code and event for indexed logging', () => {
    const enriched = enrichBoom(Boom.badRequest('boom message'), 'TEST_CODE', {
      event: { action: 'a', reason: 'r' }
    })

    expect(enriched).toMatchObject({
      isBoom: true,
      message: 'boom message',
      output: { statusCode: 400 },
      code: 'TEST_CODE',
      event: { action: 'a', reason: 'r' }
    })
  })

  it('should merge optional payload fields into output.payload', () => {
    const enriched = enrichBoom(Boom.conflict('conflict'), 'CONFLICT', {
      event: { action: 'a', reason: 'r' },
      payload: { existing: { id: 'rep-1' } }
    })

    expect(enriched.output.payload).toEqual({
      statusCode: 409,
      error: 'Conflict',
      message: 'conflict',
      existing: { id: 'rep-1' }
    })
  })

  it('should leave output.payload untouched when no payload passed', () => {
    const enriched = enrichBoom(Boom.badRequest('x'), 'X', {
      event: { action: 'a', reason: 'r' }
    })

    expect(enriched.output.payload).toEqual({
      statusCode: 400,
      error: 'Bad Request',
      message: 'x'
    })
  })

  it('should preserve the original boom reference (mutates in place)', () => {
    const original = Boom.badRequest('x')

    const enriched = enrichBoom(original, 'X', {
      event: { action: 'a', reason: 'r' }
    })

    expect(enriched).toBe(original)
  })
})

describe('badRequest', () => {
  it('should produce a 400 boom with enrichment fields', () => {
    const enriched = badRequest('bad', 'X', {
      event: { action: 'a', reason: 'r' }
    })

    expect(enriched).toMatchObject({
      isBoom: true,
      message: 'bad',
      output: { statusCode: 400 },
      code: 'X'
    })
  })
})

describe('conflict', () => {
  it('should produce a 409 boom with enrichment fields', () => {
    const enriched = conflict('exists', 'X', {
      event: { action: 'a', reason: 'r' }
    })

    expect(enriched).toMatchObject({
      isBoom: true,
      message: 'exists',
      output: { statusCode: 409 },
      code: 'X'
    })
  })
})

describe('internal', () => {
  it('should produce a 500 boom with enrichment fields', () => {
    const enriched = internal('oops', 'X', {
      event: { action: 'a', reason: 'r' }
    })

    expect(enriched).toMatchObject({
      isBoom: true,
      message: 'oops',
      output: { statusCode: 500 },
      code: 'X'
    })
  })
})
