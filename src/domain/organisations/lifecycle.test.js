import { describe, expect, it } from 'vitest'
import {
  LIFECYCLE_DECISION,
  LIFECYCLE_REFUSAL,
  applyRegistrationStatusToLinkedAccreditations,
  decideOrganisationLink,
  decideOrganisationStatusChange
} from './lifecycle.js'
import {
  ACCREDITATION_STATUS,
  ORGANISATION_STATUS,
  REGISTRATION_STATUS
} from './model.js'
import { partialMock } from '#test/type-helpers.js'

/** @import {LinkedDefraOrganisation, Organisation} from './model.js' */
/** @import {Registration} from './registration.js' */
/** @import {Accreditation} from './accreditation.js' */

/** @type {LinkedDefraOrganisation} */
const LINKED_DEFRA_ORGANISATION = {
  orgId: 'defra-org-1',
  orgName: 'Lost Ark Adventures Ltd',
  linkedAt: '2026-07-28T09:00:00.000Z',
  linkedBy: { email: 'indiana.jones@example.com', id: 'contact-1' }
}

const anOrganisation = (/** @type {Partial<Organisation>} */ fields) =>
  partialMock({ registrations: [], accreditations: [], ...fields })

const anApprovedRegistration = () =>
  partialMock({ status: REGISTRATION_STATUS.APPROVED })

describe('decideOrganisationStatusChange', () => {
  it('accepts an update that requests no status', () => {
    const existing = anOrganisation({ status: ORGANISATION_STATUS.CREATED })
    const requested = anOrganisation({})

    expect(decideOrganisationStatusChange(existing, requested)).toStrictEqual({
      outcome: LIFECYCLE_DECISION.ACCEPTED
    })
  })

  it('accepts an update that requests the status the organisation already has', () => {
    const existing = anOrganisation({ status: ORGANISATION_STATUS.ACTIVE })
    const requested = anOrganisation({ status: ORGANISATION_STATUS.ACTIVE })

    expect(decideOrganisationStatusChange(existing, requested)).toStrictEqual({
      outcome: LIFECYCLE_DECISION.ACCEPTED
    })
  })

  it('refuses a transition the organisation transition table does not allow', () => {
    const existing = anOrganisation({ status: ORGANISATION_STATUS.CREATED })
    const requested = anOrganisation({ status: ORGANISATION_STATUS.ACTIVE })

    expect(decideOrganisationStatusChange(existing, requested)).toStrictEqual({
      outcome: LIFECYCLE_DECISION.REFUSED,
      reason: LIFECYCLE_REFUSAL.INVALID_TRANSITION
    })
  })

  describe('approving an organisation', () => {
    const existing = anOrganisation({ status: ORGANISATION_STATUS.CREATED })

    it('refuses approval when no registration is approved', () => {
      const requested = anOrganisation({
        status: ORGANISATION_STATUS.APPROVED,
        registrations: [partialMock({ status: REGISTRATION_STATUS.CREATED })]
      })

      expect(decideOrganisationStatusChange(existing, requested)).toStrictEqual(
        {
          outcome: LIFECYCLE_DECISION.REFUSED,
          reason: LIFECYCLE_REFUSAL.NO_APPROVED_REGISTRATION
        }
      )
    })

    it('accepts approval when at least one registration is approved', () => {
      const requested = anOrganisation({
        status: ORGANISATION_STATUS.APPROVED,
        registrations: [
          partialMock({ status: REGISTRATION_STATUS.REJECTED }),
          anApprovedRegistration()
        ]
      })

      expect(decideOrganisationStatusChange(existing, requested)).toStrictEqual(
        {
          outcome: LIFECYCLE_DECISION.ACCEPTED
        }
      )
    })
  })

  describe('activating an organisation', () => {
    const existing = anOrganisation({ status: ORGANISATION_STATUS.APPROVED })

    it('refuses activation when no Defra organisation is linked', () => {
      const requested = anOrganisation({ status: ORGANISATION_STATUS.ACTIVE })

      expect(decideOrganisationStatusChange(existing, requested)).toStrictEqual(
        {
          outcome: LIFECYCLE_DECISION.REFUSED,
          reason: LIFECYCLE_REFUSAL.NOT_LINKED_TO_DEFRA_ORGANISATION
        }
      )
    })

    it('refuses activation when the linked Defra organisation is empty', () => {
      const requested = anOrganisation({
        status: ORGANISATION_STATUS.ACTIVE,
        linkedDefraOrganisation: partialMock({})
      })

      expect(decideOrganisationStatusChange(existing, requested)).toStrictEqual(
        {
          outcome: LIFECYCLE_DECISION.REFUSED,
          reason: LIFECYCLE_REFUSAL.NOT_LINKED_TO_DEFRA_ORGANISATION
        }
      )
    })

    it('accepts activation when a Defra organisation is linked', () => {
      const requested = anOrganisation({
        status: ORGANISATION_STATUS.ACTIVE,
        linkedDefraOrganisation: LINKED_DEFRA_ORGANISATION
      })

      expect(decideOrganisationStatusChange(existing, requested)).toStrictEqual(
        {
          outcome: LIFECYCLE_DECISION.ACCEPTED
        }
      )
    })
  })
})

describe('decideOrganisationLink', () => {
  const organisation = anOrganisation({
    id: 'org-1',
    status: ORGANISATION_STATUS.APPROVED
  })

  const link = (/** @type {Organisation[]} */ linkableOrganisations) =>
    decideOrganisationLink({
      organisation,
      linkableOrganisations,
      defraOrganisation: {
        orgId: LINKED_DEFRA_ORGANISATION.orgId,
        orgName: LINKED_DEFRA_ORGANISATION.orgName
      },
      linkedBy: LINKED_DEFRA_ORGANISATION.linkedBy,
      linkedAt: LINKED_DEFRA_ORGANISATION.linkedAt
    })

  it('refuses when the organisation is not one the user may link', () => {
    expect(link([anOrganisation({ id: 'org-2' })])).toStrictEqual({
      outcome: LIFECYCLE_DECISION.REFUSED,
      reason: LIFECYCLE_REFUSAL.NOT_LINKABLE
    })
  })

  it('activates the organisation and attaches the Defra organisation', () => {
    expect(link([anOrganisation({ id: 'org-1' })])).toStrictEqual({
      outcome: LIFECYCLE_DECISION.ACCEPTED,
      organisation: {
        ...organisation,
        status: ORGANISATION_STATUS.ACTIVE,
        linkedDefraOrganisation: LINKED_DEFRA_ORGANISATION
      }
    })
  })
})

describe('applyRegistrationStatusToLinkedAccreditations', () => {
  it.each([ACCREDITATION_STATUS.APPROVED, ACCREDITATION_STATUS.SUSPENDED])(
    'cancels a linked %s accreditation and reports it as cascade-cancelled',
    (status) => {
      /** @type {Registration[]} */
      const registrations = [
        partialMock({
          status: REGISTRATION_STATUS.CANCELLED,
          accreditationId: 'acc-1'
        })
      ]
      /** @type {Accreditation[]} */
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
      /** @type {Registration[]} */
      const registrations = [
        partialMock({
          status: REGISTRATION_STATUS.CANCELLED,
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
      partialMock({
        status: REGISTRATION_STATUS.APPROVED,
        accreditationId: 'acc-1'
      })
    ]
    /** @type {Accreditation[]} */
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
    /** @type {Registration[]} */
    const registrations = [
      partialMock({ status: REGISTRATION_STATUS.CANCELLED })
    ]
    /** @type {Accreditation[]} */
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
})
