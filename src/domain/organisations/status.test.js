import { describe, expect, it } from 'vitest'
import {
  assertOrgStatusTransitionValid,
  InvalidOrgStatusTransitionError
} from './status.js'
import { ORGANISATION_STATUS } from './model.js'

describe('assertOrgStatusTransitionValid', () => {
  // Test cases: [fromStatus, toStatus, isValid]
  const transitionTable = [
    // From CREATED
    [ORGANISATION_STATUS.CREATED, ORGANISATION_STATUS.APPROVED, true],
    [ORGANISATION_STATUS.CREATED, ORGANISATION_STATUS.REJECTED, true],
    [ORGANISATION_STATUS.CREATED, ORGANISATION_STATUS.ACTIVE, false],
    [ORGANISATION_STATUS.CREATED, ORGANISATION_STATUS.CREATED, false],

    // From APPROVED
    [ORGANISATION_STATUS.APPROVED, ORGANISATION_STATUS.ACTIVE, true],
    [ORGANISATION_STATUS.APPROVED, ORGANISATION_STATUS.CREATED, false],
    [ORGANISATION_STATUS.APPROVED, ORGANISATION_STATUS.REJECTED, false],
    [ORGANISATION_STATUS.APPROVED, ORGANISATION_STATUS.APPROVED, false],

    // From ACTIVE (no valid transitions)
    [ORGANISATION_STATUS.ACTIVE, ORGANISATION_STATUS.CREATED, false],
    [ORGANISATION_STATUS.ACTIVE, ORGANISATION_STATUS.APPROVED, false],
    [ORGANISATION_STATUS.ACTIVE, ORGANISATION_STATUS.REJECTED, false],
    [ORGANISATION_STATUS.ACTIVE, ORGANISATION_STATUS.ACTIVE, false],

    // From REJECTED
    [ORGANISATION_STATUS.REJECTED, ORGANISATION_STATUS.CREATED, true],
    [ORGANISATION_STATUS.REJECTED, ORGANISATION_STATUS.APPROVED, false],
    [ORGANISATION_STATUS.REJECTED, ORGANISATION_STATUS.ACTIVE, false],
    [ORGANISATION_STATUS.REJECTED, ORGANISATION_STATUS.REJECTED, false]
  ]

  describe('valid transitions', () => {
    const validTransitions = transitionTable.filter(([, , isValid]) => isValid)

    it.each(validTransitions)(
      'allows transition from %s to %s',
      (fromStatus, toStatus) => {
        expect(() =>
          assertOrgStatusTransitionValid(fromStatus, toStatus)
        ).not.toThrow()
      }
    )
  })

  describe('invalid transitions', () => {
    const invalidTransitions = transitionTable.filter(
      ([, , isValid]) => !isValid
    )

    it.each(invalidTransitions)(
      'rejects transition from %s to %s',
      (fromStatus, toStatus) => {
        expect(() =>
          assertOrgStatusTransitionValid(fromStatus, toStatus)
        ).toThrow(InvalidOrgStatusTransitionError)
      }
    )
  })
})
