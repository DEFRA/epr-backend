import { describe, expect, it } from 'vitest'
import {
  assertAccreditationStatusTransitionValid,
  assertOrgStatusTransitionValid,
  assertRegistrationStatusTransitionValid
} from './status.js'
import {
  ACCREDITATION_STATUS,
  ORGANISATION_STATUS,
  REGISTRATION_STATUS
} from './model.js'
import Boom from '@hapi/boom'

/** @import {AccreditationStatus, OrganisationStatus, RegistrationStatus} from './model.js' */

/**
 * @template {string} S
 * @param {(fromStatus: S, toStatus: S) => void} assertTransitionValid
 * @param {'registration' | 'accreditation'} itemKind
 * @param {[S, S, boolean][]} transitionTable
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
  /** @type {[RegistrationStatus, RegistrationStatus, boolean][]} */
  const transitionTable = [
    // From CREATED
    [REGISTRATION_STATUS.CREATED, REGISTRATION_STATUS.APPROVED, true],
    [REGISTRATION_STATUS.CREATED, REGISTRATION_STATUS.REJECTED, true],
    [REGISTRATION_STATUS.CREATED, REGISTRATION_STATUS.CANCELLED, false],
    [REGISTRATION_STATUS.CREATED, REGISTRATION_STATUS.CREATED, false],

    // From APPROVED — direct cancellation is valid; suspension is not a
    // registration status (PAE-1705)
    [REGISTRATION_STATUS.APPROVED, REGISTRATION_STATUS.CREATED, true],
    [REGISTRATION_STATUS.APPROVED, REGISTRATION_STATUS.CANCELLED, true],
    [REGISTRATION_STATUS.APPROVED, REGISTRATION_STATUS.REJECTED, false],
    [REGISTRATION_STATUS.APPROVED, REGISTRATION_STATUS.APPROVED, false],

    // From CANCELLED — reinstatement only
    [REGISTRATION_STATUS.CANCELLED, REGISTRATION_STATUS.APPROVED, true],
    [REGISTRATION_STATUS.CANCELLED, REGISTRATION_STATUS.CREATED, false],
    [REGISTRATION_STATUS.CANCELLED, REGISTRATION_STATUS.REJECTED, false],
    [REGISTRATION_STATUS.CANCELLED, REGISTRATION_STATUS.CANCELLED, false],

    // From REJECTED
    [REGISTRATION_STATUS.REJECTED, REGISTRATION_STATUS.CREATED, true],
    [REGISTRATION_STATUS.REJECTED, REGISTRATION_STATUS.APPROVED, false],
    [REGISTRATION_STATUS.REJECTED, REGISTRATION_STATUS.CANCELLED, false],
    [REGISTRATION_STATUS.REJECTED, REGISTRATION_STATUS.REJECTED, false]
  ]

  describeTransitionTable(
    assertRegistrationStatusTransitionValid,
    'registration',
    transitionTable
  )

  describe('suspended, which is not a registration status', () => {
    const suspended = /** @type {RegistrationStatus} */ (
      ACCREDITATION_STATUS.SUSPENDED
    )

    it('rejects a transition out of suspended', () => {
      expect(() =>
        assertRegistrationStatusTransitionValid(
          suspended,
          REGISTRATION_STATUS.CANCELLED
        )
      ).toThrow(
        Boom.badData(
          'Cannot transition registration status from suspended to cancelled'
        )
      )
    })

    it('rejects a transition into suspended', () => {
      expect(() =>
        assertRegistrationStatusTransitionValid(
          REGISTRATION_STATUS.APPROVED,
          suspended
        )
      ).toThrow(
        Boom.badData(
          'Cannot transition registration status from approved to suspended'
        )
      )
    })
  })
})

describe('assertAccreditationStatusTransitionValid', () => {
  /** @type {[AccreditationStatus, AccreditationStatus, boolean][]} */
  const transitionTable = [
    // From CREATED
    [ACCREDITATION_STATUS.CREATED, ACCREDITATION_STATUS.APPROVED, true],
    [ACCREDITATION_STATUS.CREATED, ACCREDITATION_STATUS.REJECTED, true],
    [ACCREDITATION_STATUS.CREATED, ACCREDITATION_STATUS.SUSPENDED, false],
    [ACCREDITATION_STATUS.CREATED, ACCREDITATION_STATUS.CANCELLED, false],
    [ACCREDITATION_STATUS.CREATED, ACCREDITATION_STATUS.CREATED, false],

    // From APPROVED — suspension stays an accreditation concept; direct
    // cancellation stays forbidden (ADR 0042 — cancelled only from suspended)
    [ACCREDITATION_STATUS.APPROVED, ACCREDITATION_STATUS.SUSPENDED, true],
    [ACCREDITATION_STATUS.APPROVED, ACCREDITATION_STATUS.CREATED, true],
    [ACCREDITATION_STATUS.APPROVED, ACCREDITATION_STATUS.REJECTED, false],
    [ACCREDITATION_STATUS.APPROVED, ACCREDITATION_STATUS.CANCELLED, false],
    [ACCREDITATION_STATUS.APPROVED, ACCREDITATION_STATUS.APPROVED, false],

    // From SUSPENDED
    [ACCREDITATION_STATUS.SUSPENDED, ACCREDITATION_STATUS.APPROVED, true],
    [ACCREDITATION_STATUS.SUSPENDED, ACCREDITATION_STATUS.CANCELLED, true],
    [ACCREDITATION_STATUS.SUSPENDED, ACCREDITATION_STATUS.CREATED, false],
    [ACCREDITATION_STATUS.SUSPENDED, ACCREDITATION_STATUS.REJECTED, false],
    [ACCREDITATION_STATUS.SUSPENDED, ACCREDITATION_STATUS.SUSPENDED, false],

    // From CANCELLED — reinstatement only
    [ACCREDITATION_STATUS.CANCELLED, ACCREDITATION_STATUS.APPROVED, true],
    [ACCREDITATION_STATUS.CANCELLED, ACCREDITATION_STATUS.CREATED, false],
    [ACCREDITATION_STATUS.CANCELLED, ACCREDITATION_STATUS.REJECTED, false],
    [ACCREDITATION_STATUS.CANCELLED, ACCREDITATION_STATUS.SUSPENDED, false],
    [ACCREDITATION_STATUS.CANCELLED, ACCREDITATION_STATUS.CANCELLED, false],

    // From REJECTED
    [ACCREDITATION_STATUS.REJECTED, ACCREDITATION_STATUS.CREATED, true],
    [ACCREDITATION_STATUS.REJECTED, ACCREDITATION_STATUS.APPROVED, false],
    [ACCREDITATION_STATUS.REJECTED, ACCREDITATION_STATUS.SUSPENDED, false],
    [ACCREDITATION_STATUS.REJECTED, ACCREDITATION_STATUS.CANCELLED, false],
    [ACCREDITATION_STATUS.REJECTED, ACCREDITATION_STATUS.REJECTED, false]
  ]

  describeTransitionTable(
    assertAccreditationStatusTransitionValid,
    'accreditation',
    transitionTable
  )
})
