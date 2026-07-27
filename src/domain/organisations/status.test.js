import { describe, expect, it } from 'vitest'
import {
  assertAccreditationStatusTransitionValid,
  assertOrgStatusTransitionValid,
  assertRegistrationStatusTransitionValid
} from './status.js'
import { ORGANISATION_STATUS, REG_ACC_STATUS } from './model.js'
import Boom from '@hapi/boom'

/** @import {OrganisationStatus, RegAccStatus} from './model.js' */

/**
 * @param {(fromStatus: string, toStatus: string) => void} assertTransitionValid
 * @param {'registration' | 'accreditation'} itemKind
 * @param {[RegAccStatus, RegAccStatus, boolean][]} transitionTable
 */
const describeTransitionTable = (
  assertTransitionValid,
  itemKind,
  transitionTable
) => {
  describe('valid transitions', () => {
    const validTransitions = transitionTable.filter(([, , isValid]) => isValid)

    it.each(validTransitions)(
      'allows transition from %s to %s',
      (fromStatus, toStatus) => {
        expect(() => assertTransitionValid(fromStatus, toStatus)).not.toThrow()
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
        expect(() => assertTransitionValid(fromStatus, toStatus)).toThrow(
          Boom.badData(
            `Cannot transition ${itemKind} status from ${fromStatus} to ${toStatus}`
          )
        )
      }
    )
  })
}

describe('assertOrgStatusTransitionValid', () => {
  /** @type {[OrganisationStatus, OrganisationStatus, boolean][]} */
  const transitionTable = [
    // From CREATED
    [ORGANISATION_STATUS.CREATED, ORGANISATION_STATUS.APPROVED, true],
    [ORGANISATION_STATUS.CREATED, ORGANISATION_STATUS.REJECTED, true],
    [ORGANISATION_STATUS.CREATED, ORGANISATION_STATUS.ACTIVE, false],
    [ORGANISATION_STATUS.CREATED, ORGANISATION_STATUS.CREATED, false],

    // From APPROVED
    [ORGANISATION_STATUS.APPROVED, ORGANISATION_STATUS.ACTIVE, true],
    [ORGANISATION_STATUS.APPROVED, ORGANISATION_STATUS.CREATED, true],
    [ORGANISATION_STATUS.APPROVED, ORGANISATION_STATUS.REJECTED, false],
    [ORGANISATION_STATUS.APPROVED, ORGANISATION_STATUS.APPROVED, false],

    // From ACTIVE
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

describe('assertRegistrationStatusTransitionValid', () => {
  /** @type {[RegAccStatus, RegAccStatus, boolean][]} */
  const transitionTable = [
    // From CREATED
    [REG_ACC_STATUS.CREATED, REG_ACC_STATUS.APPROVED, true],
    [REG_ACC_STATUS.CREATED, REG_ACC_STATUS.REJECTED, true],
    [REG_ACC_STATUS.CREATED, REG_ACC_STATUS.SUSPENDED, false],
    [REG_ACC_STATUS.CREATED, REG_ACC_STATUS.CANCELLED, false],
    [REG_ACC_STATUS.CREATED, REG_ACC_STATUS.CREATED, false],

    // From APPROVED — direct cancellation is valid; suspension is not a
    // registration status (PAE-1705)
    [REG_ACC_STATUS.APPROVED, REG_ACC_STATUS.CREATED, true],
    [REG_ACC_STATUS.APPROVED, REG_ACC_STATUS.CANCELLED, true],
    [REG_ACC_STATUS.APPROVED, REG_ACC_STATUS.SUSPENDED, false],
    [REG_ACC_STATUS.APPROVED, REG_ACC_STATUS.REJECTED, false],
    [REG_ACC_STATUS.APPROVED, REG_ACC_STATUS.APPROVED, false],

    // From SUSPENDED — not a registration status; nothing is reachable
    [REG_ACC_STATUS.SUSPENDED, REG_ACC_STATUS.APPROVED, false],
    [REG_ACC_STATUS.SUSPENDED, REG_ACC_STATUS.CANCELLED, false],
    [REG_ACC_STATUS.SUSPENDED, REG_ACC_STATUS.CREATED, false],
    [REG_ACC_STATUS.SUSPENDED, REG_ACC_STATUS.REJECTED, false],
    [REG_ACC_STATUS.SUSPENDED, REG_ACC_STATUS.SUSPENDED, false],

    // From CANCELLED — reinstatement only
    [REG_ACC_STATUS.CANCELLED, REG_ACC_STATUS.APPROVED, true],
    [REG_ACC_STATUS.CANCELLED, REG_ACC_STATUS.CREATED, false],
    [REG_ACC_STATUS.CANCELLED, REG_ACC_STATUS.REJECTED, false],
    [REG_ACC_STATUS.CANCELLED, REG_ACC_STATUS.SUSPENDED, false],
    [REG_ACC_STATUS.CANCELLED, REG_ACC_STATUS.CANCELLED, false],

    // From REJECTED
    [REG_ACC_STATUS.REJECTED, REG_ACC_STATUS.CREATED, true],
    [REG_ACC_STATUS.REJECTED, REG_ACC_STATUS.APPROVED, false],
    [REG_ACC_STATUS.REJECTED, REG_ACC_STATUS.SUSPENDED, false],
    [REG_ACC_STATUS.REJECTED, REG_ACC_STATUS.CANCELLED, false],
    [REG_ACC_STATUS.REJECTED, REG_ACC_STATUS.REJECTED, false]
  ]

  describeTransitionTable(
    assertRegistrationStatusTransitionValid,
    'registration',
    transitionTable
  )
})

describe('assertAccreditationStatusTransitionValid', () => {
  /** @type {[RegAccStatus, RegAccStatus, boolean][]} */
  const transitionTable = [
    // From CREATED
    [REG_ACC_STATUS.CREATED, REG_ACC_STATUS.APPROVED, true],
    [REG_ACC_STATUS.CREATED, REG_ACC_STATUS.REJECTED, true],
    [REG_ACC_STATUS.CREATED, REG_ACC_STATUS.SUSPENDED, false],
    [REG_ACC_STATUS.CREATED, REG_ACC_STATUS.CANCELLED, false],
    [REG_ACC_STATUS.CREATED, REG_ACC_STATUS.CREATED, false],

    // From APPROVED — suspension stays an accreditation concept; direct
    // cancellation stays forbidden (ADR 0042 — cancelled only from suspended)
    [REG_ACC_STATUS.APPROVED, REG_ACC_STATUS.SUSPENDED, true],
    [REG_ACC_STATUS.APPROVED, REG_ACC_STATUS.CREATED, true],
    [REG_ACC_STATUS.APPROVED, REG_ACC_STATUS.REJECTED, false],
    [REG_ACC_STATUS.APPROVED, REG_ACC_STATUS.CANCELLED, false],
    [REG_ACC_STATUS.APPROVED, REG_ACC_STATUS.APPROVED, false],

    // From SUSPENDED
    [REG_ACC_STATUS.SUSPENDED, REG_ACC_STATUS.APPROVED, true],
    [REG_ACC_STATUS.SUSPENDED, REG_ACC_STATUS.CANCELLED, true],
    [REG_ACC_STATUS.SUSPENDED, REG_ACC_STATUS.CREATED, false],
    [REG_ACC_STATUS.SUSPENDED, REG_ACC_STATUS.REJECTED, false],
    [REG_ACC_STATUS.SUSPENDED, REG_ACC_STATUS.SUSPENDED, false],

    // From CANCELLED — reinstatement only
    [REG_ACC_STATUS.CANCELLED, REG_ACC_STATUS.APPROVED, true],
    [REG_ACC_STATUS.CANCELLED, REG_ACC_STATUS.CREATED, false],
    [REG_ACC_STATUS.CANCELLED, REG_ACC_STATUS.REJECTED, false],
    [REG_ACC_STATUS.CANCELLED, REG_ACC_STATUS.SUSPENDED, false],
    [REG_ACC_STATUS.CANCELLED, REG_ACC_STATUS.CANCELLED, false],

    // From REJECTED
    [REG_ACC_STATUS.REJECTED, REG_ACC_STATUS.CREATED, true],
    [REG_ACC_STATUS.REJECTED, REG_ACC_STATUS.APPROVED, false],
    [REG_ACC_STATUS.REJECTED, REG_ACC_STATUS.SUSPENDED, false],
    [REG_ACC_STATUS.REJECTED, REG_ACC_STATUS.CANCELLED, false],
    [REG_ACC_STATUS.REJECTED, REG_ACC_STATUS.REJECTED, false]
  ]

  describeTransitionTable(
    assertAccreditationStatusTransitionValid,
    'accreditation',
    transitionTable
  )
})
