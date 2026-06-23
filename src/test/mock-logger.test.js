import { describe, it, expect, vi } from 'vitest'

import { createMockLogger } from './mock-logger.js'

describe('createMockLogger', () => {
  it('provides every TypedLogger method as a mock function', () => {
    const logger = createMockLogger()

    const methods = [
      'info',
      'error',
      'warn',
      'debug',
      'trace',
      'fatal',
      'child'
    ]

    expect(methods.every((m) => vi.isMockFunction(logger[m]))).toBe(true)
  })

  it('returns a usable logger from child so chained logging works', () => {
    const logger = createMockLogger()

    const child = logger.child({ requestId: 'abc' })

    expect(vi.isMockFunction(child.info)).toBe(true)
  })

  it('returns a fresh set of mocks on each call', () => {
    const first = createMockLogger()
    const second = createMockLogger()

    expect(first.info).not.toBe(second.info)
  })
})
