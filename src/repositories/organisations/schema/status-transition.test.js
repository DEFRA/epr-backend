import { applyRegistrationStatusToLinkedAccreditations } from './status-transition.js'
import { REG_ACC_STATUS } from '#domain/organisations/model.js'
import { partialMock } from '#test/type-helpers.js'

/** @import {Registration} from '#domain/organisations/registration.js' */
/** @import {Accreditation} from '#domain/organisations/accreditation.js' */

describe('applyRegistrationStatusToLinkedAccreditations', () => {
  it.each([REG_ACC_STATUS.APPROVED, REG_ACC_STATUS.SUSPENDED])(
    'cancels a linked %s accreditation and reports it as cascade-cancelled',
    (status) => {
      /** @type {Registration[]} */
      const registrations = [
        partialMock({
          status: REG_ACC_STATUS.CANCELLED,
          accreditationId: 'acc-1'
        })
      ]
      /** @type {Accreditation[]} */
      const accreditations = [partialMock({ id: 'acc-1', status })]

      const result = applyRegistrationStatusToLinkedAccreditations(
        registrations,
        accreditations
      )

      expect(result.accreditations[0].status).toBe(REG_ACC_STATUS.CANCELLED)
      expect(result.cascadeCancelledIds).toStrictEqual(new Set(['acc-1']))
    }
  )

  it.each([REG_ACC_STATUS.CREATED, REG_ACC_STATUS.REJECTED])(
    'leaves a linked %s accreditation untouched — it was never live',
    (status) => {
      /** @type {Registration[]} */
      const registrations = [
        partialMock({
          status: REG_ACC_STATUS.CANCELLED,
          accreditationId: 'acc-1'
        })
      ]
      /** @type {Accreditation[]} */
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
    /** @type {Registration[]} */
    const registrations = [
      partialMock({ status: REG_ACC_STATUS.APPROVED, accreditationId: 'acc-1' })
    ]
    /** @type {Accreditation[]} */
    const accreditations = [
      partialMock({ id: 'acc-1', status: REG_ACC_STATUS.APPROVED })
    ]

    const result = applyRegistrationStatusToLinkedAccreditations(
      registrations,
      accreditations
    )

    expect(result.accreditations[0].status).toBe(REG_ACC_STATUS.APPROVED)
    expect(result.cascadeCancelledIds).toStrictEqual(new Set())
  })

  it('leaves accreditations untouched when the cancelled registration has no linked accreditation', () => {
    /** @type {Registration[]} */
    const registrations = [partialMock({ status: REG_ACC_STATUS.CANCELLED })]
    /** @type {Accreditation[]} */
    const accreditations = [
      partialMock({ id: 'acc-1', status: REG_ACC_STATUS.APPROVED })
    ]

    const result = applyRegistrationStatusToLinkedAccreditations(
      registrations,
      accreditations
    )

    expect(result.accreditations[0].status).toBe(REG_ACC_STATUS.APPROVED)
    expect(result.cascadeCancelledIds).toStrictEqual(new Set())
  })
})
