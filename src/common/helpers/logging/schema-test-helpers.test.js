import { describe, it, expect } from 'vitest'
import { expectLogToBeCdpCompliant } from './schema-test-helpers.js'

describe('expectLogToBeCdpCompliant', () => {
  it('should not throw for a cdp-compliant log shape', () => {
    expect(() =>
      expectLogToBeCdpCompliant({
        message: 'hi',
        error: { code: 'x', message: 'oops' },
        event: { category: 'http', action: 'create_report' },
        http: { response: { status_code: 400 } }
      })
    ).not.toThrow()
  })

  it('should throw when an unknown top-level key is present', () => {
    expect(() =>
      expectLogToBeCdpCompliant({ message: 'hi', somethingNotIndexed: 'x' })
    ).toThrow(/somethingNotIndexed/)
  })

  it('should throw when a leaf field has the wrong type', () => {
    expect(() =>
      expectLogToBeCdpCompliant({
        message: 'hi',
        http: { response: { status_code: 'four-hundred' } }
      })
    ).toThrow(/status_code/)
  })

  it('should accept a log with err: <Error> by mirroring the pino+ecs err->error transform', () => {
    expect(() =>
      expectLogToBeCdpCompliant({
        message: 'something failed',
        err: new Error('oops')
      })
    ).not.toThrow()
  })

  it('should reject when err.cause adds an indexed field that the cdp allowlist does not include', () => {
    const err = new Error('outer')
    err.cause = new Error('inner')

    expect(() =>
      expectLogToBeCdpCompliant({ message: 'something failed', err })
    ).toThrow(/cause/)
  })

  it('should pass-through non-error values in err per the pino serializer contract', () => {
    expect(() =>
      expectLogToBeCdpCompliant({
        message: 'hi',
        err: { message: 'a string-shaped not-error' }
      })
    ).not.toThrow()
  })
})
