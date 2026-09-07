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
  it('reports the first and last submission on each stream, alongside the accreditation and registration', () => {
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
      registeredOnlyFirstSubmittedAt: new Date('2026-01-20'),
      registeredOnlyLastSubmittedAt: new Date('2026-03-28'),
      accreditedFirstSubmittedAt: new Date('2026-04-02'),
      accreditedLastSubmittedAt: new Date('2026-06-15'),
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
      registeredOnlySubmissions: 3,
      accreditedSubmissions: 5,
      registeredOnlyFirstSubmittedAt: '2026-01-20',
      registeredOnlyLastSubmittedAt: '2026-03-28',
      accreditedFirstSubmittedAt: '2026-04-02',
      accreditedLastSubmittedAt: '2026-06-15'
    })
    expect(summary).toMatchObject({
      scanned: 10,
      affectedOrganisations: 1,
      registeredOnlySubmissions: 3,
      accreditedSubmissions: 5
    })
  })

  it('carries the full status trail rather than asserting why the pair used both streams', () => {
    const org = orgWithAccreditationHistory([
      { status: 'created', updatedAt: '2026-01-01' },
      { status: 'approved', updatedAt: '2026-02-01' },
      { status: 'suspended', updatedAt: '2026-05-01' },
      { status: 'approved', updatedAt: '2026-06-01' },
      { status: 'cancelled', updatedAt: '2026-08-01' }
    ])
    const [registration] = org.registrations

    const usage = {
      organisationId: org.id,
      registrationId: registration.id,
      registeredOnlySubmissions: 1,
      accreditedSubmissions: 1,
      registeredOnlyFirstSubmittedAt: new Date('2026-01-15'),
      registeredOnlyLastSubmittedAt: new Date('2026-01-15'),
      accreditedFirstSubmittedAt: new Date('2026-03-01'),
      accreditedLastSubmittedAt: new Date('2026-03-01'),
      registrationNumbers: [TEST_REGISTRATION_NUMBER],
      accreditationNumbers: [TEST_ACCREDITATION_NUMBER]
    }

    const { reports } = diagnoseStreamTransitions(
      { scanned: 1, usages: [usage] },
      [org]
    )

    expect(reports).toHaveLength(1)
    expect(reports[0].accreditationHistory).toBe(
      'created@2026-01-01 -> approved@2026-02-01 -> suspended@2026-05-01 -> approved@2026-06-01 -> cancelled@2026-08-01'
    )
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
      registeredOnlyFirstSubmittedAt: new Date('2026-03-28'),
      registeredOnlyLastSubmittedAt: new Date('2026-03-28'),
      accreditedFirstSubmittedAt: new Date('2026-04-02'),
      accreditedLastSubmittedAt: new Date('2026-04-02'),
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

  it('reports a usage row even when its registration has no linked accreditation, with null accreditation fields', () => {
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
      registeredOnlyFirstSubmittedAt: new Date('2026-01-05'),
      registeredOnlyLastSubmittedAt: new Date('2026-01-05'),
      accreditedFirstSubmittedAt: new Date('2026-01-10'),
      accreditedLastSubmittedAt: new Date('2026-01-10'),
      registrationNumbers: [],
      accreditationNumbers: []
    }

    const { reports } = diagnoseStreamTransitions(
      { scanned: 1, usages: [usage] },
      [org]
    )

    expect(reports).toHaveLength(1)
    expect(reports[0].accreditationId).toBeNull()
    expect(reports[0].accreditationHistory).toBe('none')
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
      registeredOnlyFirstSubmittedAt: new Date('2026-01-05'),
      registeredOnlyLastSubmittedAt: new Date('2026-01-05'),
      accreditedFirstSubmittedAt: new Date('2026-01-10'),
      accreditedLastSubmittedAt: new Date('2026-01-10'),
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
      registeredOnlyFirstSubmittedAt: new Date('2026-01-05'),
      registeredOnlyLastSubmittedAt: new Date('2026-01-05'),
      accreditedFirstSubmittedAt: new Date('2026-01-10'),
      accreditedLastSubmittedAt: new Date('2026-01-10'),
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
