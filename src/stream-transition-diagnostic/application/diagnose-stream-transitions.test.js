import { describe, it, expect } from 'vitest'

import {
  buildRegistration,
  buildReadOrganisation
} from '#repositories/organisations/contract/test-data.js'
import { partialMock, invalidArg } from '#test/type-helpers.js'

import {
  TEST_REGISTRATION_NUMBER,
  TEST_ACCREDITATION_NUMBER,
  orgWithAccreditationHistory
} from './diagnose-test-helpers.js'
import { diagnoseStreamTransitions } from './diagnose-stream-transitions.js'

describe('diagnoseStreamTransitions', () => {
  it('reports registered_to_accredited when registered-only submissions precede the approval', () => {
    const org = orgWithAccreditationHistory([
      { status: 'created', updatedAt: '2026-01-01' },
      { status: 'approved', updatedAt: '2026-04-01' }
    ])
    const [registration] = org.registrations
    const [accreditation] = org.accreditations

    const usage = {
      organisationId: org.id,
      registrationId: registration.id,
      registeredOnlySubmissions: 3,
      accreditedSubmissions: 5,
      registeredOnlyLastSubmittedAt: new Date('2026-03-28'),
      accreditedFirstSubmittedAt: new Date('2026-04-02'),
      registrationNumbers: [TEST_REGISTRATION_NUMBER],
      accreditationNumbers: [TEST_ACCREDITATION_NUMBER]
    }

    const { reports, summary } = diagnoseStreamTransitions(
      { scanned: 10, usages: [usage] },
      [org]
    )

    expect(reports).toHaveLength(1)
    expect(reports[0]).toMatchObject({
      organisationId: org.id,
      orgId: org.orgId,
      registrationId: registration.id,
      accreditationId: accreditation.id,
      direction: 'registered_to_accredited',
      registeredOnlySubmissions: 3,
      accreditedSubmissions: 5
    })
    expect(summary).toMatchObject({
      scanned: 10,
      affectedOrganisations: 1,
      registeredToAccredited: 1,
      accreditedToRegistered: 0,
      registeredOnlySubmissions: 3,
      accreditedSubmissions: 5
    })
  })

  it('renders null orgName and material when the organisation/registration carry none', () => {
    const org = orgWithAccreditationHistory([
      { status: 'created', updatedAt: '2026-01-01' },
      { status: 'approved', updatedAt: '2026-04-01' }
    ])
    org.companyDetails = invalidArg(undefined)
    org.registrations[0].material = invalidArg(undefined)

    const [registration] = org.registrations

    const usage = {
      organisationId: org.id,
      registrationId: registration.id,
      registeredOnlySubmissions: 1,
      accreditedSubmissions: 1,
      registeredOnlyLastSubmittedAt: new Date('2026-03-28'),
      accreditedFirstSubmittedAt: new Date('2026-04-02'),
      registrationNumbers: [TEST_REGISTRATION_NUMBER],
      accreditationNumbers: [TEST_ACCREDITATION_NUMBER]
    }

    const { reports } = diagnoseStreamTransitions(
      { scanned: 1, usages: [usage] },
      [org]
    )

    expect(reports).toHaveLength(1)
    expect(reports[0].orgName).toBeNull()
    expect(reports[0].material).toBeNull()
  })

  it('reports accredited_to_registered when accredited submissions precede the cancellation', () => {
    const org = orgWithAccreditationHistory([
      { status: 'created', updatedAt: '2026-01-01' },
      { status: 'approved', updatedAt: '2026-02-01' },
      { status: 'cancelled', updatedAt: '2026-08-01' }
    ])
    const [registration] = org.registrations

    const usage = {
      organisationId: org.id,
      registrationId: registration.id,
      registeredOnlySubmissions: 2,
      accreditedSubmissions: 4,
      registeredOnlyLastSubmittedAt: new Date('2026-09-01'),
      accreditedFirstSubmittedAt: new Date('2026-03-01'),
      registrationNumbers: [TEST_REGISTRATION_NUMBER],
      accreditationNumbers: [TEST_ACCREDITATION_NUMBER]
    }

    const { reports, summary } = diagnoseStreamTransitions(
      { scanned: 5, usages: [usage] },
      [org]
    )

    expect(reports).toHaveLength(1)
    expect(reports[0].direction).toBe('accredited_to_registered')
    expect(summary.accreditedToRegistered).toBe(1)
    expect(summary.registeredToAccredited).toBe(0)
  })

  it('reports both directions for an org that switched both ways', () => {
    const org = orgWithAccreditationHistory([
      { status: 'created', updatedAt: '2026-01-01' },
      { status: 'approved', updatedAt: '2026-02-01' },
      { status: 'suspended', updatedAt: '2026-05-01' },
      { status: 'cancelled', updatedAt: '2026-08-01' }
    ])
    const [registration] = org.registrations

    const usage = {
      organisationId: org.id,
      registrationId: registration.id,
      registeredOnlySubmissions: 1,
      accreditedSubmissions: 1,
      // registered-only submission before the approval...
      registeredOnlyLastSubmittedAt: new Date('2026-01-15'),
      // ...and accredited submission before the cancellation.
      accreditedFirstSubmittedAt: new Date('2026-03-01'),
      registrationNumbers: [TEST_REGISTRATION_NUMBER],
      accreditationNumbers: [TEST_ACCREDITATION_NUMBER]
    }

    const { reports, summary } = diagnoseStreamTransitions(
      { scanned: 1, usages: [usage] },
      [org]
    )

    expect(reports).toHaveLength(2)
    expect(reports.map((r) => r.direction).sort()).toEqual([
      'accredited_to_registered',
      'registered_to_accredited'
    ])
    expect(summary.affectedOrganisations).toBe(1)
  })

  it('skips a usage whose accreditation has no approved/cancelled entry', () => {
    const org = orgWithAccreditationHistory([
      { status: 'created', updatedAt: '2026-01-01' }
    ])
    const [registration] = org.registrations

    const usage = {
      organisationId: org.id,
      registrationId: registration.id,
      registeredOnlySubmissions: 1,
      accreditedSubmissions: 1,
      registeredOnlyLastSubmittedAt: new Date('2026-01-05'),
      accreditedFirstSubmittedAt: new Date('2026-01-10'),
      registrationNumbers: [],
      accreditationNumbers: []
    }

    const { reports } = diagnoseStreamTransitions(
      { scanned: 1, usages: [usage] },
      [org]
    )

    expect(reports).toEqual([])
  })

  it('skips a usage whose registration has no linked accreditation', () => {
    const registration = buildRegistration({ accreditationId: undefined })
    const org = buildReadOrganisation({
      registrations: [partialMock(registration)],
      accreditations: []
    })

    const usage = {
      organisationId: org.id,
      registrationId: registration.id,
      registeredOnlySubmissions: 1,
      accreditedSubmissions: 1,
      registeredOnlyLastSubmittedAt: new Date('2026-01-05'),
      accreditedFirstSubmittedAt: new Date('2026-01-10'),
      registrationNumbers: [],
      accreditationNumbers: []
    }

    const { reports } = diagnoseStreamTransitions(
      { scanned: 1, usages: [usage] },
      [org]
    )

    expect(reports).toEqual([])
  })

  it('skips a usage whose registration is not found on the organisation', () => {
    const org = orgWithAccreditationHistory([
      { status: 'created', updatedAt: '2026-01-01' },
      { status: 'approved', updatedAt: '2026-02-01' }
    ])

    const usage = {
      organisationId: org.id,
      registrationId: 'missing-registration',
      registeredOnlySubmissions: 1,
      accreditedSubmissions: 1,
      registeredOnlyLastSubmittedAt: new Date('2026-01-05'),
      accreditedFirstSubmittedAt: new Date('2026-01-10'),
      registrationNumbers: [],
      accreditationNumbers: []
    }

    const { reports } = diagnoseStreamTransitions(
      { scanned: 1, usages: [usage] },
      [org]
    )

    expect(reports).toEqual([])
  })

  it('skips a usage whose organisation is not found', () => {
    const usage = {
      organisationId: 'missing-org',
      registrationId: 'missing-reg',
      registeredOnlySubmissions: 1,
      accreditedSubmissions: 1,
      registeredOnlyLastSubmittedAt: new Date('2026-01-05'),
      accreditedFirstSubmittedAt: new Date('2026-01-10'),
      registrationNumbers: [],
      accreditationNumbers: []
    }

    const { reports, summary } = diagnoseStreamTransitions(
      { scanned: 0, usages: [usage] },
      []
    )

    expect(reports).toEqual([])
    expect(summary.affectedOrganisations).toBe(0)
  })
})
