import { describe, expect, it } from 'vitest'
import {
  assertOrgStatusTransitionValid,
  assertRegAccStatusTransitionValid
} from './status.js'
import { ORGANISATION_STATUS, REG_ACC_STATUS } from './model.js'
import Boom from '@hapi/boom'

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
      'rejects transition from %s to %s with Boom error',
      (fromStatus, toStatus) => {
        expect(() =>
          assertOrgStatusTransitionValid(fromStatus, toStatus)
        ).toThrow(
          Boom.badData(
            `Cannot transition organisation status from ${fromStatus} to ${toStatus}`
          )
        )
      }
    )
  })
})

describe('assertRegAccStatusTransitionValid', () => {
  // Test cases: [fromStatus, toStatus, isValid]
  const transitionTable = [
    // From CREATED
    [REG_ACC_STATUS.CREATED, REG_ACC_STATUS.APPROVED, true],
    [REG_ACC_STATUS.CREATED, REG_ACC_STATUS.REJECTED, true],
    [REG_ACC_STATUS.CREATED, REG_ACC_STATUS.SUSPENDED, false],
    [REG_ACC_STATUS.CREATED, REG_ACC_STATUS.CANCELLED, false],
    [REG_ACC_STATUS.CREATED, REG_ACC_STATUS.CREATED, false],

    // From APPROVED
    [REG_ACC_STATUS.APPROVED, REG_ACC_STATUS.SUSPENDED, true],
    [REG_ACC_STATUS.APPROVED, REG_ACC_STATUS.CREATED, false],
    [REG_ACC_STATUS.APPROVED, REG_ACC_STATUS.REJECTED, false],
    [REG_ACC_STATUS.APPROVED, REG_ACC_STATUS.CANCELLED, false],
    [REG_ACC_STATUS.APPROVED, REG_ACC_STATUS.APPROVED, false],

    // From SUSPENDED
    [REG_ACC_STATUS.SUSPENDED, REG_ACC_STATUS.APPROVED, true],
    [REG_ACC_STATUS.SUSPENDED, REG_ACC_STATUS.CANCELLED, true],
    [REG_ACC_STATUS.SUSPENDED, REG_ACC_STATUS.CREATED, false],
    [REG_ACC_STATUS.SUSPENDED, REG_ACC_STATUS.REJECTED, false],
    [REG_ACC_STATUS.SUSPENDED, REG_ACC_STATUS.SUSPENDED, false],

    // From CANCELLED (no valid transitions)
    [REG_ACC_STATUS.CANCELLED, REG_ACC_STATUS.CREATED, false],
    [REG_ACC_STATUS.CANCELLED, REG_ACC_STATUS.APPROVED, false],
    [REG_ACC_STATUS.CANCELLED, REG_ACC_STATUS.REJECTED, false],
    [REG_ACC_STATUS.CANCELLED, REG_ACC_STATUS.SUSPENDED, false],
    [REG_ACC_STATUS.CANCELLED, REG_ACC_STATUS.CANCELLED, false],

    // From REJECTED (no valid transitions)
    [REG_ACC_STATUS.REJECTED, REG_ACC_STATUS.CREATED, true],
    [REG_ACC_STATUS.REJECTED, REG_ACC_STATUS.APPROVED, false],
    [REG_ACC_STATUS.REJECTED, REG_ACC_STATUS.SUSPENDED, false],
    [REG_ACC_STATUS.REJECTED, REG_ACC_STATUS.CANCELLED, false],
    [REG_ACC_STATUS.REJECTED, REG_ACC_STATUS.REJECTED, false]
  ]

  describe('valid transitions', () => {
    const validTransitions = transitionTable.filter(([, , isValid]) => isValid)

    it.each(validTransitions)(
      'allows transition from %s to %s',
      (fromStatus, toStatus) => {
        expect(() =>
          assertRegAccStatusTransitionValid(fromStatus, toStatus)
        ).not.toThrow()
      }
    )
  })

  describe('invalid transitions', () => {
    const invalidTransitions = transitionTable.filter(
      ([, , isValid]) => !isValid
    )

    it.each(invalidTransitions)(
      'rejects transition from %s to %s with Boom error',
      (fromStatus, toStatus) => {
        expect(() =>
          assertRegAccStatusTransitionValid(fromStatus, toStatus)
        ).toThrow(
          Boom.badData(
            `Cannot transition registration/accreditation status from ${fromStatus} to ${toStatus}`
          )
        )
      }
    )
  })
})
