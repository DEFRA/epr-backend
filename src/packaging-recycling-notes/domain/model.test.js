import { describe, it, expect } from 'vitest'

import { PRN_STATUS, PRN_STATUS_TRANSITIONS } from './model.js'

describe('PRN_STATUS', () => {
  it('includes awaiting_cancellation status', () => {
    expect(PRN_STATUS.AWAITING_CANCELLATION).toBe('awaiting_cancellation')
  })

  it('does not include rejected as a status', () => {
    expect(PRN_STATUS).not.toHaveProperty('REJECTED')
  })
})

describe('PRN_STATUS_TRANSITIONS', () => {
  it('allows awaiting_acceptance to transition to accepted', () => {
    expect(PRN_STATUS_TRANSITIONS[PRN_STATUS.AWAITING_ACCEPTANCE]).toContain(
      PRN_STATUS.ACCEPTED
    )
  })

  it('allows awaiting_acceptance to transition to awaiting_cancellation', () => {
    expect(PRN_STATUS_TRANSITIONS[PRN_STATUS.AWAITING_ACCEPTANCE]).toContain(
      PRN_STATUS.AWAITING_CANCELLATION
    )
  })

  it('does not allow awaiting_acceptance to transition to rejected', () => {
    expect(
      PRN_STATUS_TRANSITIONS[PRN_STATUS.AWAITING_ACCEPTANCE]
    ).not.toContain('rejected')
  })

  it('allows awaiting_cancellation to transition to cancelled', () => {
    expect(PRN_STATUS_TRANSITIONS[PRN_STATUS.AWAITING_CANCELLATION]).toContain(
      PRN_STATUS.CANCELLED
    )
  })

  it('only allows awaiting_cancellation to transition to cancelled', () => {
    expect(PRN_STATUS_TRANSITIONS[PRN_STATUS.AWAITING_CANCELLATION]).toEqual([
      PRN_STATUS.CANCELLED
    ])
  })

  it('does not have a transition entry for rejected', () => {
    expect(PRN_STATUS_TRANSITIONS).not.toHaveProperty('rejected')
  })
})
