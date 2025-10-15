import { describe, it, expect } from 'vitest'
import { ORGANISATION_STATUS, isValidTransition } from './organisation.js'

describe('isValidTransition', () => {
  const { CREATED, APPROVED, REJECTED, SUSPENDED, ARCHIVED } =
    ORGANISATION_STATUS

  // Transition validation table
  // Format: [fromStatus, toStatus, expected]
  const transitionTable = [
    // Initial state (no fromStatus)
    [undefined, CREATED, true],
    [null, CREATED, true],

    // CREATED transitions
    [CREATED, APPROVED, true],
    [CREATED, REJECTED, true],
    [CREATED, SUSPENDED, true],
    [CREATED, ARCHIVED, true],
    [CREATED, CREATED, false],

    // APPROVED transitions
    [APPROVED, SUSPENDED, true],
    [APPROVED, ARCHIVED, true],
    [APPROVED, CREATED, false],
    [APPROVED, APPROVED, false],
    [APPROVED, REJECTED, false],

    // SUSPENDED transitions
    [SUSPENDED, APPROVED, true],
    [SUSPENDED, ARCHIVED, true],
    [SUSPENDED, CREATED, false],
    [SUSPENDED, REJECTED, false],
    [SUSPENDED, SUSPENDED, false],

    // REJECTED transitions
    [REJECTED, ARCHIVED, true],
    [REJECTED, CREATED, false],
    [REJECTED, APPROVED, false],
    [REJECTED, SUSPENDED, false],
    [REJECTED, REJECTED, false],

    // ARCHIVED transitions (terminal state)
    [ARCHIVED, CREATED, false],
    [ARCHIVED, APPROVED, false],
    [ARCHIVED, REJECTED, false],
    [ARCHIVED, SUSPENDED, false],
    [ARCHIVED, ARCHIVED, false],

    // Invalid fromStatus
    ['unknown', CREATED, false]
  ]

  it.each(transitionTable)(
    'should return %s when transitioning from "%s" to "%s"',
    (fromStatus, toStatus, expected) => {
      expect(isValidTransition(fromStatus, toStatus)).toBe(expected)
    }
  )
})
