import { applyRegistrationStatusToLinkedAccreditations } from './status-transition.js'
import {
  ACCREDITATION_STATUS,
  REGISTRATION_STATUS
} from '#domain/organisations/model.js'
import { partialMock } from '#test/type-helpers.js'

/** @import {RegistrationUpdate} from '#domain/organisations/registration.js' */
/** @import {AccreditationUpdate} from '#domain/organisations/accreditation.js' */

describe('applyRegistrationStatusToLinkedAccreditations', () => {
  it.each([ACCREDITATION_STATUS.APPROVED, ACCREDITATION_STATUS.SUSPENDED])(
    'cancels a linked %s accreditation and reports it as cascade-cancelled',
    (status) => {
      /** @type {RegistrationUpdate[]} */
      const registrations = [
        partialMock({
          status: REGISTRATION_STATUS.CANCELLED,
          accreditationId: 'acc-1'
        })
      ]
      /** @type {AccreditationUpdate[]} */
      const accreditations = [partialMock({ id: 'acc-1', status })]

      const result = applyRegistrationStatusToLinkedAccreditations(
        registrations,
        accreditations
      )

      expect(result.accreditations[0].status).toBe(
        ACCREDITATION_STATUS.CANCELLED
      )
      expect(result.cascadeCancelledIds).toStrictEqual(new Set(['acc-1']))
    }
  )

  it.each([ACCREDITATION_STATUS.CREATED, ACCREDITATION_STATUS.REJECTED])(
    'leaves a linked %s accreditation untouched — it was never live',
    (status) => {
      /** @type {RegistrationUpdate[]} */
      const registrations = [
        partialMock({
          status: REGISTRATION_STATUS.CANCELLED,
          accreditationId: 'acc-1'
        })
      ]
      /** @type {AccreditationUpdate[]} */
      const accreditations = [partialMock({ id: 'acc-1', status })]

      const result = applyRegistrationStatusToLinkedAccreditations(
        registrations,
        accreditations
      )

      expect(result.accreditations[0].status).toBe(status)
      expect(result.cascadeCancelledIds).toStrictEqual(new Set())
    }
  )

  it('leaves accreditations untouched when the linked registration is not cancelled', () => {
    /** @type {RegistrationUpdate[]} */
    const registrations = [
      partialMock({
        status: REGISTRATION_STATUS.APPROVED,
        accreditationId: 'acc-1'
      })
    ]
    /** @type {AccreditationUpdate[]} */
    const accreditations = [
      partialMock({ id: 'acc-1', status: ACCREDITATION_STATUS.APPROVED })
    ]

    const result = applyRegistrationStatusToLinkedAccreditations(
      registrations,
      accreditations
    )

    expect(result.accreditations[0].status).toBe(ACCREDITATION_STATUS.APPROVED)
    expect(result.cascadeCancelledIds).toStrictEqual(new Set())
  })

  it('leaves accreditations untouched when the cancelled registration has no linked accreditation', () => {
    /** @type {RegistrationUpdate[]} */
    const registrations = [
      partialMock({ status: REGISTRATION_STATUS.CANCELLED })
    ]
    /** @type {AccreditationUpdate[]} */
    const accreditations = [
      partialMock({ id: 'acc-1', status: ACCREDITATION_STATUS.APPROVED })
    ]

    const result = applyRegistrationStatusToLinkedAccreditations(
      registrations,
      accreditations
    )

    expect(result.accreditations[0].status).toBe(ACCREDITATION_STATUS.APPROVED)
    expect(result.cascadeCancelledIds).toStrictEqual(new Set())
  })

  it('skips a linked accreditation whose update proposes no status, since liveness is judged on the payload', () => {
    /** @type {RegistrationUpdate[]} */
    const registrations = [
      partialMock({
        status: REGISTRATION_STATUS.CANCELLED,
        accreditationId: 'acc-1'
      })
    ]
    /** @type {AccreditationUpdate[]} */
    const accreditations = [partialMock({ id: 'acc-1', status: undefined })]

    const result = applyRegistrationStatusToLinkedAccreditations(
      registrations,
      accreditations
    )

    expect(result.accreditations[0].status).toBeUndefined()
    expect(result.cascadeCancelledIds).toStrictEqual(new Set())
  })
})
