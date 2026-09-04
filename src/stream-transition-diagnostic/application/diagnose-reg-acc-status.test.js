import { describe, it, expect } from 'vitest'

import {
  buildRegistration,
  buildAccreditation,
  buildReadOrganisation
} from '#repositories/organisations/contract/test-data.js'
import { getCurrentStatus } from '#repositories/organisations/status.js'
import { partialMock, invalidArg } from '#test/type-helpers.js'

import { orgWithAccreditationHistory } from './diagnose-test-helpers.js'
import { diagnoseRegAccStatus } from './diagnose-reg-acc-status.js'

describe('diagnoseRegAccStatus', () => {
  it('reports a currently suspended accreditation, with both trails', () => {
    const org = orgWithAccreditationHistory([
      { status: 'created', updatedAt: '2026-02-10' },
      { status: 'approved', updatedAt: '2026-04-01' },
      { status: 'suspended', updatedAt: '2026-07-15' }
    ])

    const { reports, summary } = diagnoseRegAccStatus([org])

    expect(reports).toHaveLength(1)
    expect(reports[0]).toMatchObject({
      kind: 'accreditation',
      line: 'currentlySuspended',
      suspensionCount: 1,
      cancellationCount: 0
    })
    expect(reports[0].registrationHistory).not.toBe('none')
    expect(reports[0].accreditationHistory).toContain('suspended@2026-07-15')
    expect(summary.currentlySuspendedAccreditations).toBe(1)
  })

  it('reports a currently cancelled accreditation whose registration stays approved', () => {
    const org = orgWithAccreditationHistory([
      { status: 'created', updatedAt: '2026-02-10' },
      { status: 'approved', updatedAt: '2026-04-01' },
      { status: 'suspended', updatedAt: '2026-05-01' },
      { status: 'cancelled', updatedAt: '2026-06-01' }
    ])

    const { reports } = diagnoseRegAccStatus([org])

    expect(reports).toHaveLength(1)
    expect(reports[0].line).toBe('currentlyCancelled')
    expect(reports[0].kind).toBe('accreditation')
  })

  it('reports the previously line for a cancelled-then-reapproved registration with no accreditation involvement', () => {
    const registration = buildRegistration({
      accreditationId: undefined,
      statusHistory: [
        { status: 'created', updatedAt: '2026-01-01' },
        { status: 'approved', updatedAt: '2026-02-01' },
        { status: 'cancelled', updatedAt: '2026-03-01' },
        { status: 'approved', updatedAt: '2026-04-01' }
      ]
    })
    const org = buildReadOrganisation({
      registrations: [partialMock(registration)],
      accreditations: []
    })

    const { reports } = diagnoseRegAccStatus([org])

    expect(reports).toHaveLength(1)
    expect(reports[0]).toMatchObject({
      line: 'previously',
      kind: 'registration',
      currentStatus: 'approved',
      cancellationCount: 1
    })
  })

  it('renders null orgName and material when the organisation/registration carry none', () => {
    const registration = buildRegistration({
      accreditationId: undefined,
      statusHistory: [
        { status: 'created', updatedAt: '2026-01-01' },
        { status: 'approved', updatedAt: '2026-02-01' },
        { status: 'cancelled', updatedAt: '2026-03-01' }
      ]
    })
    delete registration.material
    const org = buildReadOrganisation({
      registrations: [partialMock(registration)],
      accreditations: []
    })
    org.companyDetails = invalidArg(undefined)

    const { reports } = diagnoseRegAccStatus([org])

    expect(reports).toHaveLength(1)
    expect(reports[0].orgName).toBeNull()
    expect(reports[0].material).toBeNull()
  })

  it('reports a currently cancelled registration, carrying the accreditation cascade-cancellation too', () => {
    const org = orgWithAccreditationHistory([
      { status: 'created', updatedAt: '2026-02-10' },
      { status: 'approved', updatedAt: '2026-04-01' },
      { status: 'cancelled', updatedAt: '2026-08-03' }
    ])
    org.registrations[0].statusHistory = [
      { status: 'created', updatedAt: '2026-01-12' },
      { status: 'approved', updatedAt: '2026-02-01' },
      { status: 'cancelled', updatedAt: '2026-08-03' }
    ]
    org.registrations[0].status = getCurrentStatus(org.registrations[0])

    const { reports, summary } = diagnoseRegAccStatus([org])

    expect(reports).toHaveLength(1)
    expect(reports[0].line).toBe('currentlyCancelled')
    expect(reports[0].kind).toBe('registration')
    expect(reports[0].accreditationHistory).toContain('cancelled@2026-08-03')
    expect(summary.currentlyCancelledRegistrations).toBe(1)
    expect(summary.currentlyCancelledAccreditations).toBe(0)
  })

  it('reports the previously line for an accreditation suspended then re-approved, not the currently-suspended line', () => {
    const org = orgWithAccreditationHistory([
      { status: 'created', updatedAt: '2026-02-10' },
      { status: 'approved', updatedAt: '2026-04-01' },
      { status: 'suspended', updatedAt: '2026-05-02' },
      { status: 'approved', updatedAt: '2026-06-11' }
    ])

    const { reports, summary } = diagnoseRegAccStatus([org])

    expect(reports).toHaveLength(1)
    expect(reports[0]).toMatchObject({
      line: 'previously',
      currentStatus: 'approved',
      suspensionCount: 1
    })
    expect(summary.previouslySuspendedNowApproved).toBe(1)
    expect(summary.currentlySuspendedAccreditations).toBe(0)
  })

  it('counts a repeated suspend-then-reapprove cycle', () => {
    const org = orgWithAccreditationHistory([
      { status: 'created', updatedAt: '2026-02-10' },
      { status: 'approved', updatedAt: '2026-04-01' },
      { status: 'suspended', updatedAt: '2026-05-02' },
      { status: 'approved', updatedAt: '2026-06-11' },
      { status: 'suspended', updatedAt: '2026-08-01' },
      { status: 'approved', updatedAt: '2026-09-01' }
    ])

    const { reports } = diagnoseRegAccStatus([org])

    expect(reports).toHaveLength(1)
    expect(reports[0].suspensionCount).toBe(2)
    expect(reports[0].line).toBe('previously')
  })

  it('reports a cancelled-then-reapproved accreditation on the previously line', () => {
    const org = orgWithAccreditationHistory([
      { status: 'created', updatedAt: '2026-02-10' },
      { status: 'approved', updatedAt: '2026-04-01' },
      { status: 'suspended', updatedAt: '2026-05-01' },
      { status: 'cancelled', updatedAt: '2026-06-01' },
      { status: 'approved', updatedAt: '2026-07-01' }
    ])

    const { reports, summary } = diagnoseRegAccStatus([org])

    expect(reports).toHaveLength(1)
    expect(reports[0]).toMatchObject({
      line: 'previously',
      currentStatus: 'approved',
      cancellationCount: 1
    })
    expect(summary.previouslyCancelledNowApproved).toBe(1)
  })

  it('reports an accreditation not linked from any registration (orphan)', () => {
    const accreditation = buildAccreditation({
      statusHistory: [
        { status: 'created', updatedAt: '2026-01-01' },
        { status: 'approved', updatedAt: '2026-02-01' },
        { status: 'suspended', updatedAt: '2026-03-01' }
      ]
    })
    accreditation.status = 'suspended'
    const org = buildReadOrganisation({
      registrations: [
        partialMock(buildRegistration({ accreditationId: undefined }))
      ],
      accreditations: [partialMock(accreditation)]
    })
    org.registrations[0].status = 'approved'

    const { reports } = diagnoseRegAccStatus([org])

    expect(reports).toHaveLength(1)
    expect(reports[0]).toMatchObject({
      kind: 'accreditation',
      line: 'currentlySuspended',
      registrationId: null
    })
    expect(reports[0].registrationHistory).toBe('none')
  })

  it('reports a currently cancelled registration with no accreditation ever linked', () => {
    const registration = buildRegistration({
      accreditationId: undefined,
      statusHistory: [
        { status: 'created', updatedAt: '2026-01-01' },
        { status: 'approved', updatedAt: '2026-02-01' },
        { status: 'cancelled', updatedAt: '2026-03-01' }
      ]
    })
    registration.status = 'cancelled'
    const org = buildReadOrganisation({
      registrations: [partialMock(registration)],
      accreditations: []
    })

    const { reports } = diagnoseRegAccStatus([org])

    expect(reports).toHaveLength(1)
    expect(reports[0]).toMatchObject({
      kind: 'registration',
      line: 'currentlyCancelled',
      accreditationId: null
    })
    expect(reports[0].accreditationHistory).toBe('none')
  })

  it('reports nothing for a pair that has never been suspended or cancelled', () => {
    const org = orgWithAccreditationHistory([
      { status: 'created', updatedAt: '2026-01-01' },
      { status: 'approved', updatedAt: '2026-02-01' }
    ])

    const { reports, summary } = diagnoseRegAccStatus([org])

    expect(reports).toEqual([])
    expect(summary.organisations).toBe(1)
    expect(summary.currentlySuspendedAccreditations).toBe(0)
    expect(summary.currentlyCancelledAccreditations).toBe(0)
    expect(summary.currentlyCancelledRegistrations).toBe(0)
    expect(summary.previouslySuspendedNowApproved).toBe(0)
    expect(summary.previouslyCancelledNowApproved).toBe(0)
  })

  it('reports each pair on exactly one line — populations do not overlap', () => {
    const suspendedOrg = orgWithAccreditationHistory([
      { status: 'created', updatedAt: '2026-01-01' },
      { status: 'approved', updatedAt: '2026-02-01' },
      { status: 'suspended', updatedAt: '2026-03-01' }
    ])
    const previouslyOrg = orgWithAccreditationHistory([
      { status: 'created', updatedAt: '2026-01-01' },
      { status: 'approved', updatedAt: '2026-02-01' },
      { status: 'suspended', updatedAt: '2026-03-01' },
      { status: 'approved', updatedAt: '2026-04-01' }
    ])
    const cleanOrg = orgWithAccreditationHistory([
      { status: 'created', updatedAt: '2026-01-01' },
      { status: 'approved', updatedAt: '2026-02-01' }
    ])

    const { reports } = diagnoseRegAccStatus([
      suspendedOrg,
      previouslyOrg,
      cleanOrg
    ])

    expect(reports).toHaveLength(2)
    const lines = reports.map((r) => r.line)
    expect(lines).toContain('currentlySuspended')
    expect(lines).toContain('previously')
  })
})
