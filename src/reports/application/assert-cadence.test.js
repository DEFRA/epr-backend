import { describe, it, expect } from 'vitest'
import { assertCadence } from './assert-cadence.js'

/** @import { CdpBoom } from '#common/helpers/logging/cdp-boom.js' */

/**
 * @param {() => void} fn
 * @returns {CdpBoom}
 */
const capture = (fn) => {
  try {
    fn()
    throw new Error('expected function to throw')
  } catch (err) {
    return /** @type {CdpBoom} */ (err)
  }
}

describe('assertCadence', () => {
  it('does not throw when cadence matches a registered-only registration', () => {
    expect(() =>
      assertCadence('quarterly', { accreditationId: null })
    ).not.toThrow()
  })

  it('does not throw when cadence matches an accredited registration', () => {
    expect(() =>
      assertCadence('monthly', { accreditationId: 'acc-1' })
    ).not.toThrow()
  })

  it('throws Boom with code, event, and payload when registered-only uses monthly', () => {
    const boom = capture(() =>
      assertCadence('monthly', { accreditationId: null })
    )

    expect(boom.isBoom).toBe(true)
    expect(boom.output.statusCode).toBe(400)
    expect(boom.message).toBe(
      "Cadence 'monthly' does not match registration type — expected 'quarterly'"
    )
    expect(boom.code).toBe('cadence_mismatch')
    expect(boom.event).toEqual({
      action: 'create_report',
      reason: 'actual=monthly expected=quarterly'
    })
    expect(boom.output.payload.cadence).toEqual({
      actual: 'monthly',
      expected: 'quarterly'
    })
  })

  it('throws with expected=monthly when an accredited registration uses quarterly', () => {
    const boom = capture(() =>
      assertCadence('quarterly', { accreditationId: 'acc-1' })
    )

    expect(boom.code).toBe('cadence_mismatch')
    expect(boom.event).toEqual({
      action: 'create_report',
      reason: 'actual=quarterly expected=monthly'
    })
  })
})
