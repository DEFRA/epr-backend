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
      assertCadence('quarterly', { accreditation: null })
    ).not.toThrow()
  })

  it('does not throw when cadence matches an accredited registration', () => {
    expect(() =>
      assertCadence('monthly', { accreditation: { status: 'approved' } })
    ).not.toThrow()
  })

  it('throws Boom with code, event, and payload when registered-only uses monthly', () => {
    const boom = capture(() =>
      assertCadence('monthly', { accreditation: null })
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

  it('does not throw when cadence matches a registration with accreditation in created status', () => {
    expect(() =>
      assertCadence('quarterly', { accreditation: { status: 'created' } })
    ).not.toThrow()
  })

  it('throws with expected=monthly when an accredited registration uses quarterly', () => {
    const boom = capture(() =>
      assertCadence('quarterly', { accreditation: { status: 'approved' } })
    )

    expect(boom.code).toBe('cadence_mismatch')
    expect(boom.event).toEqual({
      action: 'create_report',
      reason: 'actual=quarterly expected=monthly'
    })
  })
})
