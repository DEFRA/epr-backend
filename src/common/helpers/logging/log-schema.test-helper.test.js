import { describe, it, expect } from 'vitest'
import { expectLogToBeCdpCompliant } from './log-schema.test-helper.js'

describe('expectLogToBeCdpCompliant', () => {
  it('should not throw for a CDP-compliant log shape', () => {
    expect(() =>
      expectLogToBeCdpCompliant({
        message: 'hi',
        error: { code: 'X', message: 'oops' },
        event: { category: 'http', action: 'create_report' },
        http: { response: { status_code: 400 } }
      })
    ).not.toThrow()
  })

  it('should throw with a message naming the offending key when an unknown top-level key is present', () => {
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

  it('should accept a log with err: <Error> by mirroring the pino+ecs err→error transform', () => {
    expect(() =>
      expectLogToBeCdpCompliant({
        message: 'something failed',
        err: new Error('oops')
      })
    ).not.toThrow()
  })

  it('should accept err with a .cause chain since the serializer no longer surfaces cause', () => {
    const err = new Error('outer')
    err.cause = new Error('inner')

    expect(() =>
      expectLogToBeCdpCompliant({ message: 'something failed', err })
    ).not.toThrow()
  })

  it('should pass-through non-Error values in err per the pino serializer contract', () => {
    expect(() =>
      expectLogToBeCdpCompliant({
        message: 'hi',
        err: { message: 'a string-shaped not-Error' }
      })
    ).not.toThrow()
  })
})
